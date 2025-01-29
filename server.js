const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const secret = process.env.SECRET;
const app = express();
const port = process.env.PORT;

// Create a new pool using the DATABASE_URL from the .env file
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Necessary for Neon connections due to SSL
    }
});

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

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

// Tracking data endpoint
app.post('/track', (req, res) => {
    console.log('Received tracking data:', req.body);
    const token = String(req.body.apiToken);
    const decoded = jwt.verify(token, secret);
    console.log("Decoded Name:", decoded.name);

    // Handle database operations here
    // ...

    res.send('Tracking data received!!!');
});

app.listen(port, () => {
    console.log('Connected to DB & Listening on port', port);
});
