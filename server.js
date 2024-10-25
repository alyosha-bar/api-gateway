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
    const userID = req.query.user;
    const apiToken = req.query.apitoken ? String(req.query.apitoken) : "";
    const baseurl = req.query.base ? String(req.query.base) : "";

    // Log the values for debugging
    console.log("UserID:", userID);
    console.log("API Token:", apiToken);
    console.log("Base URL:", baseurl);

    const script = `
        (function(global) {
            const trackingServerUrl = 'https://tracker-api-gateway.onrender.com/track';
            const originalFetch = global.fetch;

            const baseurl = ${JSON.stringify(baseurl)}; // Ensure baseurl is a valid string
            const userID = ${JSON.stringify(userID)}; // Ensure userID is a valid string
            const apiToken = ${JSON.stringify(apiToken)}; // Ensure apiToken is a valid string

            global.fetch = async function(resource, init) {
                const startTime = Date.now();

                try {
                    const normalizedBaseUrl = baseurl.endsWith('/') ? baseurl : baseurl + '/';

                    if (!resource.startsWith(normalizedBaseUrl)) {
                        return originalFetch(resource, init); // Skip tracking if URL doesn’t match
                    }

                    const response = await originalFetch(resource, init);
                    const endTime = Date.now();
                    const responseTime = endTime - startTime;

                    sendTrackingData(resource, init, response.status, responseTime);

                    return response;
                } catch (error) {
                    sendTrackingData(resource, init, 'error', -1);
                    throw error;
                }
            };

            function sendTrackingData(url, init, status, responseTime) {
                const trackingData = {
                    userId: userID,
                    apiToken: apiToken,
                    apiUrl: url,
                    method: (init && init.method) || 'GET',
                    status: status,
                    responseTime: responseTime,
                    timestamp: new Date().toISOString(),
                };

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
});

app.post('/track', (req, res) => { // change the route to /track/:id
    
    // save req.body into database with associated user id
    console.log("Adding into the database.")

    console.log('Received tracking data:', req.body);
    const token = String(req.body.apiToken)
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

