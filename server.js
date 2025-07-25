const express = require('express')
const { Pool } = require('pg')
var cors = require('cors')
require('dotenv').config();

const app = express()
const port = 3000

console.log(process.env.NEON_DATABASE_URL)

// Pool for Neon PostgreSQL
const neonPool = new Pool({
    connectionString: process.env.NEON_DATABASE_URL,
    ssl: { 
        rejectUnauthorized: false 
    }
});

// Test Neon connection (optional, but good practice)
neonPool.connect()
    .then(() => console.log('Connected to Neon PostgreSQL.'))
    .catch(err => console.error('Error connecting to Neon PostgreSQL:', err.stack));

const pool = new Pool({
    host: process.env.QUEST_HOST,
    port: 8812,
    user: 'admin',
    password: 'quest',
    database: 'qdb'
})

// Set the client timezone to UTC
process.env.TZ = 'UTC';

// allow all origins
app.use(cors())

// Add middleware to parse JSON body
app.use(express.json())

// Tracking endpoint --> injected into users' code
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

// Saves API analytics
app.post('/track', async (req, res) => {
    console.log("Adding tracking data to QuestDB.");
    console.log('Received tracking data:', req.body);

    const { userId, apiToken, apiUrl, method, status, responseTime, timestamp } = req.body;

    // Validate essential fields
    if (!userId || !apiToken || !apiUrl || !status || !responseTime || !timestamp) {
        console.error("Missing required tracking data fields.");
        return res.status(400).send("Missing required tracking data fields.");
    }

    let client;

    try {
        const apiTokenQuery = "SELECT id FROM apis WHERE api_token = $1";
        const apiTokenResult = await neonPool.query(apiTokenQuery, [apiToken]);

        if (apiTokenResult.rows.length === 0) {
            console.log(`Invalid API token received: ${apiToken}`);
            return res.status(400).json({ message: "Invalid API token." });
        }
        const api_id = apiTokenResult.rows[0].id;

        // Get a client from the pool
        client = await pool.connect();


        const insertQuery = `
            INSERT INTO api_traffic_log (api_id, user_id, timestamp, method, status, response_time_ms)
            VALUES ($1, $2, $3, $4, $5, $6)
        `;

        const timestampObj = new Date(timestamp);

        // Ensure status is treated as a number
        const numericStatus = parseInt(status, 10);

        // Ensure responseTime is treated as a number
        const numericResponseTime = parseInt(responseTime, 10);

        await client.query(insertQuery, [
            api_id,
            userId,
            timestampObj,
            method,
            numericStatus,
            numericResponseTime
        ]);

        console.log(`Successfully inserted tracking data for API ID ${api_id}.`);
        res.status(200).send('Tracking data received and stored in QuestDB!');

    } catch (error) {
        console.error('Error processing /track request:', error);
        // Handle specific errors if necessary (e.g., invalid token, DB errors)
        if (error.message.includes("Invalid API token")) { // Example: Check for specific token error if returned by pool.query
             return res.status(400).json({ message: "Invalid API token." });
        }
        res.status(500).send('Internal Server Error while processing tracking data.');
    } finally {
        // IMPORTANT: Release the client back to the pool
        if (client) {
            client.release();
        }
    }
});


// run server

app.listen(port, () => {
    console.log(`API server running at port: ${port}`)
})

// close connection

process.on('SIGINT', async () => {
    await pool.end()
    console.log('Pool has ended')
    process.exit(0)
})
