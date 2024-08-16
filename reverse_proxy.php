<?php

// Set the target base URL
$targetBaseUrl = 'http://localhost:3000';

// Get request details
$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['REQUEST_URI'];
$queryString = $_SERVER['QUERY_STRING'];
$contentType = $_SERVER['CONTENT_TYPE'];
$requestBody = file_get_contents('php://input');

// Extract authorization header
$authorizationHeader = $_SERVER['HTTP_AUTHORIZATION'];

// Construct the full target URL
$targetUrl = $targetBaseUrl . $path . ($queryString ? '?' . $queryString : '');

// Create the cURL handle
$ch = curl_init($targetUrl);

// Set cURL options
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
curl_setopt($ch, CURLOPT_POSTFIELDS, $requestBody);
curl_setopt($ch, CURLOPT_HTTPHEADER, array_merge(getallheaders(), ['Authorization: ' . $authorizationHeader, 'Content-Type: ' . $contentType]));

// curl_setopt($ch, CURLOPT_POSTFIELDS, $requestBody);

// Execute the request
$response = curl_exec($ch);

// Check for errors
if (curl_errno($ch)) {
    die('Error: ' . curl_error($ch));
}

// Close the cURL handle
curl_close($ch);

// Send the response back to the client
header('Content-Type: ' . $headers['Content-Type']);
echo $response;
