const express = require('express');
const cors = require('cors');
require('dotenv').config()

const app = express();
const port = process.env.PORT;

// Enable CORS for all routes
app.use(cors());

// Middleware to parse JSON request bodies
app.use(express.json());


app.get('/', (req, res) => {
    res.send('Hello, World!');
});

app.get('/tracking', (req, res) => {

    const userID = req.query.user
    console.log(userID)

    const script = `
        (function(global) {
            // Your tracking server URL
            const trackingServerUrl = '/api/track'; // should go to /api/track/ID
        
            // Save the original fetch function to use later
            const originalFetch = global.fetch;
        
            // The tracking function that intercepts API requests
            global.fetch = async function(resource, init) {
                const startTime = Date.now();
                
                try {
                    // Call the original fetch function
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

    // update usage of THIS API where the user is the same
        // calculate response time 
        // date, time and month of the request
        // save status code (count how many of which status code are there)

    



    console.log('Received tracking data:', req.body);

    res.send('Tracking data received!!!');
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
