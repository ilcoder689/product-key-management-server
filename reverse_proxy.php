<?php

// Set the target base URL
$targetBaseUrl = 'http://localhost:3000';

// Get request details
$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['REQUEST_URI'];
$queryString = $_SERVER['QUERY_STRING'] ?? '';
$contentType = $_SERVER['CONTENT_TYPE'] ?? '';
$requestBody = file_get_contents('php://input');

// Extract authorization header if present
$authorizationHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';

// Construct the full target URL
$targetUrl = $targetBaseUrl . $path . ($queryString ? '?' . $queryString : '');

// Create the cURL handle
$ch = curl_init($targetUrl);

// Set cURL options
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HEADER, true); // Include headers in the output
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
if ($method !== 'GET' && $method !== 'HEAD') { // Avoid sending a body for GET/HEAD
    curl_setopt($ch, CURLOPT_POSTFIELDS, $requestBody);
}

// Construct headers
$requestHeaders = [];
foreach (getallheaders() as $name => $value) {
    $requestHeaders[] = "$name: $value";
}
if (!empty($authorizationHeader)) {
    $requestHeaders[] = 'Authorization: ' . $authorizationHeader;
}
if (!empty($contentType)) {
    $requestHeaders[] = 'Content-Type: ' . $contentType;
}
curl_setopt($ch, CURLOPT_HTTPHEADER, $requestHeaders);

// Execute the request
$response = curl_exec($ch);

// Check for errors
if (curl_errno($ch)) {
    die('Error: ' . curl_error($ch));
}

// Separate headers and body
$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$responseHeaders = substr($response, 0, $headerSize);
$responseBody = substr($response, $headerSize);

// Get the HTTP status code
$httpStatusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

// Close the cURL handle
curl_close($ch);

// Send the response headers back to the client
http_response_code($httpStatusCode); // Set HTTP status code
foreach (explode("\r\n", $responseHeaders) as $headerLine) {
    if (stripos($headerLine, 'Transfer-Encoding:') === 0 || stripos($headerLine, 'Content-Length:') === 0) {
        // Skip transfer encoding and content length headers to avoid conflicts
        continue;
    }
    header($headerLine);
}

// Send the response body back to the client
echo $responseBody;

?>
