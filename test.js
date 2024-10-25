function isRequestToBaseUrl(requestUrl, baseUrl) {
    // Ensure the base URL ends with a slash for accurate comparison
    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    
    // Normalize the request URL by checking if it starts with the base URL
    return requestUrl.startsWith(normalizedBaseUrl);
}

// Example usage:
const baseUrl = "https://api.example.com";
const requestUrl1 = "https://api.example.com/resource";
const requestUrl2 = "https://api.example.com/resource/123";
const requestUrl3 = "https://otherapi.example.com/resource";

console.log(isRequestToBaseUrl(requestUrl1, baseUrl)); // true
console.log(isRequestToBaseUrl(requestUrl2, baseUrl)); // true
console.log(isRequestToBaseUrl(requestUrl3, baseUrl)); // false