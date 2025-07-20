const express = require('express')
const {Pool} = require('pg')

const app = express()
const port = 3000

const pool = new Pool({
    host: '127.0.0.1',
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

// API endpoint to get recent trades
app.get('/api/trades', async (req, res) => {
    const {symbol, limit = 10} = req.query

    try {
        let query
        let params = []

        if (symbol) {
            query = 'SELECT * FROM sensor_data;'
            params = [symbol, limit]
        } else {
            query = 'SELECT * FROM sensor_data;'
            params = [limit]
        }

        const result = await pool.query(query, params)
        res.json(result.rows)
    } catch (error) {
        console.error('API error:', error)
        res.status(500).json({error: error.message})
    }
})

// API endpoint to get trade statistics
app.get('/api/stats', async (req, res) => {
    const {days = 7} = req.query

    try {
        const result = await pool.query(`
      SELECT * FROM sensor_data;
    `, [days])

        res.json(result.rows)
    } catch (error) {
        console.error('API error:', error)
        res.status(500).json({error: error.message})
    }
})

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

    let client; // Declare client outside try block to ensure it can be released in finally

    try {
        // 1. Get api_id from api_token
        // This query is assuming you have an 'api' table with 'token' and 'id' columns.
        // Adjust table/column names if they differ in your setup.
        const apiTokenQuery = "SELECT id FROM api WHERE token = $1";
        const apiTokenResult = await pool.query(apiTokenQuery, [apiToken]);

        if (apiTokenResult.rows.length === 0) {
            console.log(`Invalid API token received: ${apiToken}`);
            return res.status(400).json({ message: "Invalid API token." });
        }
        const api_id = apiTokenResult.rows[0].id;

        // Get a client from the pool
        client = await pool.connect();

        // 2. Prepare and insert the tracking data into QuestDB
        //    We are inserting individual events, not aggregating them here.
        //    QuestDB's 'timestamp' column will be the designated timestamp.
        //    Ensure your api_traffic_log table has:
        //    - api_id: SYMBOL (or appropriate type)
        //    - user_id: SYMBOL (or appropriate type)
        //    - timestamp: TIMESTAMP
        //    - method: SYMBOL (or VARCHAR)
        //    - status: INT
        //    - response_time_ms: LONG

        const insertQuery = `
            INSERT INTO api_traffic_log (api_id, user_id, timestamp, method, status, response_time_ms)
            VALUES ($1, $2, $3, $4, $5, $6)
        `;

        // QuestDB expects ISO 8601 format for timestamps or JavaScript Date objects when using pg.
        // req.body.timestamp is likely already in a parseable format (e.g., ISO 8601 string from frontend).
        // Creating a Date object from it is a safe way to pass it.
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
    console.log(`API server running at http://localhost:${port}`)
})

// close connection

process.on('SIGINT', async () => {
    await pool.end()
    console.log('Pool has ended')
    process.exit(0)
})
