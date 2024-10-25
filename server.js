const express = require('express');
const cors = require('cors');
require('dotenv').config()
const { Pool } = require('pg');

// token stuff
const jwt = require('jsonwebtoken')
const secret = process.env.SECRET

const app = express();
const port = process.env.PORT;

// Create a new pool using the DATABASE_URL from the .env file
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Necessary for Neon connections due to SSL
    }
});
  
// Test the connection
pool.connect((err, client, release) => {
if (err) {
    return console.error('Error acquiring client', err.stack);
}
client.query('SELECT NOW()', (err, result) => {
    release();
        if (err) {
        return console.error('Error executing query', err.stack);
        }
        console.log(result.rows);  // Should log the current timestamp from the database
    });
});


// Enable CORS for all routes
app.use(cors());

// Middleware to parse JSON request bodies
app.use(express.json());


app.get('/', (req, res) => {
    res.send('Hello, World!');
});

app.get('/tracking', (req, res) => {

    const userID = req.query.user
    const apiToken = req.query.apitoken
    const baseurl = req.query.base
    console.log(userID)
    console.log(apiToken)
    console.log(baseurl)

    // not the best way:
    // fetch the api base url based off of token --> which i dont know how to decode
    // and check that against the resource variable


    const script = `
        (function(global) {
            // Your tracking server URL
            const trackingServerUrl = 'https://tracker-api-gateway.onrender.com/track'; // should go to /api/track/ID
        
            // Save the original fetch function to use later
            const originalFetch = global.fetch;
        
            // The tracking function that intercepts API requests
            global.fetch = async function(resource, init) {
                const startTime = Date.now();
                
                try {
                    // Call the original fetch function
                    
                    // Ensure the base URL ends with a slash for accurate comparison
                    const normalizedBaseUrl = ${baseUrl}.endsWith('/') ? ${baseUrl} : ${baseUrl} + '/';
                    
                    // Normalize the request URL by checking if it starts with the base URL
                    if (!requestUrl.startsWith(normalizedBaseUrl)) {
                        return
                    }
                    
                    // execute original fetch
                    const response = await originalFetch(resource, init);
                    
                    // Calculate response time
                    const endTime = Date.now();
                    const responseTime = endTime - startTime;
            
                    // Send tracking data to your server
                    sendTrackingData(resource, init, response.status, responseTime);
            
                    return response; // Return the original response for the app to use
                } catch (error) {
                    // Handle errors (also track if needed)
                    sendTrackingData(resource, init, 'error', -1);
                    throw error; // Re-throw error for app to handle
                }
            };
        
            // Function to send tracking data
            function sendTrackingData(url, init, status, responseTime) {
                const trackingData = {
                    userId: ${userID}, // Replace with the actual user ID
                    apiToken: ${apiToken},
                    apiUrl: url,
                    method: (init && init.method) || 'GET', // Default to GET if no method
                    status: status,
                    responseTime: responseTime,
                    timestamp: new Date().toISOString(),
                };
        
                // Send data to the tracking server
                originalFetch(trackingServerUrl, {
                    method: 'POST',
                    headers: {
                    'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(trackingData),
                }).catch(err => console.error('Tracking failed:', err));
            }
        })(window);
    `;


    res.setHeader('Content-Type', 'application/javascript');
    res.send(script);

})


app.post('/track', (req, res) => { // change the route to /track/:id
    

    // save req.body into database with associated user id
    console.log("Adding into the database.")

    console.log('Received tracking data:', req.body);
    const token = req.body.apiToken
    // 1. decode api token  --> find api name being tracked

    // 2. 
    
    // API TOKEN DECODING
    // verify the jwt by using TOKEN and the SECRET
    // reveals api name / id?
    const decoded = jwt.verify(token, secret);
    console.log("Decoded Name:", decoded.name);


    // TIMESTAMP STUFF
    const new_timestamp = Date.parse(req.body.timestamp.split('T')[0])
    
    
    // UPDATE OR INSERT into database

    // Fetch from database based on token / api ID
    const end_date = Date.parse("2024-01-30")
    
    if (end_date < new_timestamp) {
        console.log("here.")
        // timestamp is after the end date
        // INSERT A NEW RECORD
    } else {
        console.log("not there.")
        // timestamp is before end date
        // UPDATE A RECORD
    }

    res.send('Tracking data received!!!');
});


app.listen(process.env.PORT, () => {
    console.log('Connected to DB & Listening on port', process.env.PORT)
})

