/**
 * Simple Express server for previewing the project
 */

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the project root
app.use(express.static(path.join(__dirname)));

// Serve the README.md file at the root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'README.md'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Preview server running at http://localhost:${PORT}`);
});