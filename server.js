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

    // decode tracking data:
    const status_code = req.body.status



    const apitoken = String(req.body.apiToken);

    
    const responseTime = req.body.responseTime
    console.log(`Response time: ${responseTime}`)
    console.log(`Response time type: ${responseTime.type}`)



    // 1. get api_id from api_token
    const query = "SELECT ap.id FROM api ap WHERE ap.token = $1"
    const result = await pool.query(query, [apitoken])

    console.log(query)

    if (result.rows === undefined) {
        res.status(400).json({"message": "Invalid API token."})
    }

    console.log(result.rows)
    const api_id = result.rows[0].id;

    // TIMESTAMP STUFF
    const new_timestamp = Date.parse(req.body.timestamp.split('T')[0])
    
    
    // UPDATE OR INSERT into database

    const endDateQuery = "SELECT MAX(end_date) AS latest_end_date FROM api_usage WHERE api_id = $1";
    const endDateResult = await pool.query(endDateQuery, [api_id]);
    
    let end_date;
    if (endDateResult.rows[0].latest_end_date) {
        end_date = Date.parse(endDateResult.rows[0].latest_end_date);
    } else {
        end_date = 0;
    }

    if (end_date < new_timestamp) {
        console.log("here.");
        
        // adjust new_timestamp to the first day of its month
        const newStart = getFirstDayOfMonth(new_timestamp);
        const newEnd = getLastDayOfMonth(new_timestamp);
        
        
        // INSERT A NEW RECORD
        let insertQuery = ""
        if (status_code >= 200 && status_code < 400) {
            insertQuery = "INSERT INTO api_usage (api_id, start_date, end_date, total_req, total_latency) VALUES ($1, $2, $3, 1, $4)";
        } else {
            insertQuery = "INSERT INTO api_usage (api_id, start_date, end_date, total_req, errorcount, total_latency) VALUES ($1, $2, $3, 1, 1, $4)";
        }
        await pool.query(insertQuery, [api_id, newStart, newEnd, responseTime]);
    
        console.log("New record inserted with start_date and end_date at the beginning of the month.");
    } else {
        console.log("not there.");
    
        // Determine the correct query based on status_code
        let updateQuery = "";
        if (status_code >= 200 && status_code < 400) {
            updateQuery = `
                UPDATE api_usage 
                SET total_req = total_req + 1,
                    total_latency = total_latency + $1
                WHERE api_id = $2
                AND $3 BETWEEN start_date AND end_date
            `;
        } else {
            updateQuery = `
                UPDATE api_usage 
                SET total_req = total_req + 1,
                    total_latency = total_latency + $1,
                    errorcount = errorcount + 1 
                WHERE api_id = $2
                AND $3 BETWEEN start_date AND end_date
            `;
        }
    
        // Get the first day of the month for newend_date
        const newend_date = getFirstDayOfMonth(new_timestamp);
    
        await pool.query(updateQuery, [responseTime ,api_id, newend_date]);
    
        console.log("Record updated where newend_date is between start_date and end_date.");
    }
    

    res.send('Tracking data received!!!');
});

function getFirstDayOfMonth(timestamp) {
    const date = new Date(timestamp);
    return new Date(date.getFullYear(), date.getMonth(), 1); // First day of the month
}

function getLastDayOfMonth(timestamp) {
    const date = new Date(timestamp);
    return new Date(date.getFullYear(), date.getMonth() + 1, 0); // Last day of the month
}


app.listen(process.env.PORT, () => {
    console.log('Connected to DB & Listening on port', process.env.PORT)
})

