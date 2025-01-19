#!/bin/bash

# URL to check
URL="http://localhost:3000"

# Command to start the Node.js server
START_SERVER_COMMAND="npm start"

# Directory where your Node.js project is located
PROJECT_DIR="/home/u486613842/public_html/pkms"

# Timeout for the curl request
TIMEOUT=10

# Check if the URL is accessible
HTTP_STATUS=$(curl -o /dev/null -s -w "%{http_code}\n" --max-time $TIMEOUT $URL)

# If the status code is not 200, start the server
if [ "$HTTP_STATUS" -ne 200 ]; then
    echo "localhost:3000 is not accessible. Starting the Node.js server."
    source /home/u486613842/.profile >/dev/null
    cd $PROJECT_DIR
    nohup $START_SERVER_COMMAND &
else
    echo "localhost:3000 is accessible."
fi

# Cron Job Command
# * * * * * /home/u486613842/public_html/pkms/monitor.sh