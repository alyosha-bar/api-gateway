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

// Tracking endpoint
app.get('/tracking', (req, res) => {
    const userID = req.query.user;
    const apiToken = String(req.query.apitoken);
    const baseurl = req.query.base;

    const script = `
        (function(global) {
            const trackingServerUrl = 'https://tracker-api-gateway.onrender.com/track';
            const originalFetch = global.fetch;

            global.fetch = async function(resource, init) {
                const startTime = Date.now();
                const normalizedBaseUrl = ${JSON.stringify(baseurl)}.endsWith('/') 
                    ? ${JSON.stringify(baseurl)} 
                    : ${JSON.stringify(baseurl)} + '/';

                if (!resource.startsWith(normalizedBaseUrl)) {
                    return originalFetch(resource, init);
                }

                try {
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
                    userId: ${JSON.stringify(userID)},
                    apiToken: ${JSON.stringify(apiToken)},
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



app.post('/track', async (req, res) => { // change the route to /track/:id
    

    // save req.body into database with associated user id
    console.log("Adding into the database.")

    console.log('Received tracking data:', req.body);
    const apitoken = String(req.body.apiToken);
    const usertoken = String(req.body.userId);

    // 1. get api_id from api_token
    const query = "SELECT ap.id FROM api ap WHERE ap.token = $1"
    const result = await pool.query(query, [apitoken])

    console.log(query)

    if (result.rows === undefined) {
        res.status(400).json({"message": "Invalid API token."})
    }

    console.log(result.rows)

    // 3. get api_usages LAtEST end date


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

