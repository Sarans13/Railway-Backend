//  Imports ----------------------------------------------------
import express from "express";
import mysql from "mysql";
import cors from "cors";
import dotenv from 'dotenv';

// Initialize the app ------------------------------------------
const app = express();
const port = process.env.PORT || 3003;
app.listen(port, () => {
    console.log("Backend is running!! at " + port);
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
    console.log(process.env.DB_NAME)
    if (err) {
      console.error('Database connection failed: ' + err.stack);
      return;
    }
    console.log('Connected to database.');
});

//admin login -> get complaints --------------------------------
app.get('/complaints', (req, res) => {
    let sql = 'SELECT * FROM complaints';
    db.query(sql, (err, results) => {
        if (err) throw err;
        res.json(results);  // });
    })
  });

  //dealer ->get complaints ------------------------------------
  app.get('/users/:user_id/complaints', (req, res) => {
    let sql = 'SELECT * FROM complaints WHERE userID = ?';
    db.query(sql, [req.params.user_id], (err, results) => {
        if (err) throw err;
        res.json(results);
    });
  });

 
// Endpoint to validate username and password -------------------
app.post('/login', (req, res) => {
    const { userName, password } = req.body;  
    if (!userName || !password) {
      return res.status(400).send('Username and password are required.');
    }  
    const query = 'SELECT userID FROM users WHERE userName = ? AND password = ?';
    db.query(query, [userName, password], (err, results) => {
      if (err) {
        console.error('Error querying the database:', err);
        return res.status(500).send('Error querying the database.');
      }  
      if (results.length > 0) {
        const userId = results[0].userID;
        res.json({ message: 'Login successful', userId });
      } else {
        res.status(401).send('Invalid username or password.');
      }
    });
  });

// CREATE A COMPLAINT BY THE EMPLOYEES
app.post('/addComplaint', (req, res) => {
  const complaint = req.body;

  const sql = `INSERT INTO complaints 
  (userName, userID, title, complaint, department, website, module, division, document, status) 
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`;

  db.query(sql, [
      complaint.userName,
      complaint.userID,
      complaint.title,
      complaint.complaint,
      complaint.department,
      complaint.website,
      complaint.module,
      complaint.division,
      complaint.document
  ], (err, result) => {
      if (err) {
          console.error('Error inserting data:', err);
          res.status(500).send('Failed to insert data');
      } else {
          console.log('Data inserted successfully:', result);
          res.status(200).send('Data inserted successfully');
      }
  });
});

// Define a route to handle retrieving complaints by userID
app.get('/getComplaintByUserId/:userID', (req, res) => {
  const userID = req.params.userID;

  const sql = 'SELECT * FROM complaints WHERE userID = ?';

  db.query(sql, [userID], (err, results) => {
      if (err) {
          console.error('Error retrieving data:', err);
          res.status(500).send('Failed to retrieve data');
      } else {
          console.log('Data retrieved successfully:', results);
          res.status(200).json(results);
      }
  });
});

app.get('/getComplaintByComplaintId/:id',(req,res) =>{
  const compID = req.params.id;

  const sql = 'SELECT * FROM complaints WHERE complaintID = ?';

  db.query(sql, [compID], (err, results) => {
      if (err) {
          console.error('Error retrieving data:', err);
          res.status(500).send('Failed to retrieve data');
      } else {
          console.log('Data retrieved successfully:', results);
          res.status(200).json(results);
      }
  });
})