//  Imports ----------------------------------------------------
import express from "express";
import mysql from "mysql";
import cors from "cors";
import dotenv from 'dotenv';

// Initialize the app ------------------------------------------
const app = express();
const port = process.env.PORT || 8800;
app.listen(port, () => {
    console.log("Backend is running!!");
})
app.use(express.json());
app.use(cors());
// load the environment variable from the file
dotenv.config();

// Connect with the database -----------------------------------
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});
db.connect(err => {
    if (err) {
      console.error('Database connection failed: ' + err.stack);
      return;
    }
    console.log('Connected to database.');
});