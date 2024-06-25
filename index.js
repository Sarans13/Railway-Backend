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

// create a complaint by the employee -----------------------------
app.post('/addComplaint', (req, res) => {
    const complaint = req.body;
  
    const sqlInsertComplaint = `INSERT INTO complaints 
    (userName, userID, title, complaint, department, website, module, division, document, status) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`;
  
    db.query(sqlInsertComplaint, [
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
            console.error('Error inserting data into complaints:', err);
            res.status(500).send('Failed to insert data');
        } else {
            const complaintID = result.insertId;
            console.log('Complaint inserted successfully with ID:', complaintID);
  
            const sqlInsertTransaction = `INSERT INTO transactions 
            (complaintID, createdBy, sentTo, remark, status) 
            VALUES (?, ?, ?, ?, 'pending')`;
  
            db.query(sqlInsertTransaction, [
                complaintID,
                complaint.userID,
                1, // Assuming '1' is the userID of the admin
                complaint.complaint
            ], (err, result) => {
                if (err) {
                    console.error('Error inserting data into transactions:', err);
                    res.status(500).send('Failed to insert transaction');
                } else {
                    console.log('Transaction inserted successfully:', result);
                    res.status(200).send({
                        message: 'Complaint and transaction inserted successfully',
                        complaintID: complaintID,
                        userID: complaint.userID,
                        status: 'pending'
                    });
                }
            });
        }
    });
  });
  


// Define a route to handle retrieving complaints by userID ------------


app.get('/getComplaintByUserId/:userID', (req, res) => {
    const userID = req.params.userID;
    const userLevelSql = 'SELECT userLevel FROM users WHERE userID = ?';
  
    db.query(userLevelSql, [userID], (err, userResults) => {
        if (err) {
            console.error('Error retrieving user level:', err);
            res.status(500).send('Failed to retrieve user level');
        } else if (userResults.length === 0) {
            res.status(404).send('User not found');
        } else {
            const userLevel = userResults[0].userLevel;
            let sql;
            if (userLevel === 2) {
                sql = 'SELECT complaintID, title, complaint, status FROM complaints WHERE userID = ?';
                db.query(sql, [userID], (err, complaintResults) => {
                    if (err) {
                        console.error('Error retrieving complaints:', err);
                        res.status(500).send('Failed to retrieve complaints');
                    } else {
                        res.status(200).json(complaintResults);
                    }
                });
            } else {
                sql = `
                SELECT c.*, t.transactionId, t.createdBy, t.sentTo, t.timeAndDate, t.remark, t.status AS transactionStatus
                FROM complaints c
                LEFT JOIN transactions t ON c.complaintID = t.complaintID
                WHERE c.userID = ?`;
                db.query(sql, [userID], (err, complaintResults) => {
                    if (err) {
                        console.error('Error retrieving complaints and transactions:', err);
                        res.status(500).send('Failed to retrieve complaints and transactions');
                    } else {
                        // Group the complaints and their transactions
                        const complaintsMap = {};
                        complaintResults.forEach(row => {
                            if (!complaintsMap[row.complaintID]) {
                                complaintsMap[row.complaintID] = {
                                    complaintID: row.complaintID,
                                    userName: row.userName,
                                    userID: row.userID,
                                    title: row.title,
                                    complaint: row.complaint,
                                    department: row.department,
                                    website: row.website,
                                    module: row.module,
                                    division: row.division,
                                    document: row.document,
                                    status: row.status,
                                    transactions: []
                                };
                            }
                            if (row.transactionId) {
                                complaintsMap[row.complaintID].transactions.push({
                                    transactionId: row.transactionId,
                                    createdBy: row.createdBy,
                                    sentTo: row.sentTo,
                                    timeAndDate: row.timeAndDate,
                                    remark: row.remark,
                                    status: row.transactionStatus
                                });
                            }
                        });
  
                        const complaintsList = Object.values(complaintsMap);
                        res.status(200).json(complaintsList);
                    }
                });
            }
        }
    });
  });
  
  


// Define a route to retrieve results by compllaint id ------------------
app.get('/getComplaintByComplaintId/:id', (req, res) => {
  const compID = req.params.id;
  const getUserIDSql = 'SELECT userID FROM complaints WHERE complaintID = ?';

  db.query(getUserIDSql, [compID], (err, complaintResults) => {
      if (err) {
          console.error('Error retrieving user ID:', err);
          res.status(500).send('Failed to retrieve user ID');
      } else if (complaintResults.length === 0) {
          res.status(404).send('Complaint not found');
      } else {
          const userID = complaintResults[0].userID;
          const getUserLevelSql = 'SELECT userLevel FROM users WHERE userID = ?';

          db.query(getUserLevelSql, [userID], (err, userResults) => {
              if (err) {
                  console.error('Error retrieving user level:', err);
                  res.status(500).send('Failed to retrieve user level');
              } else if (userResults.length === 0) {
                  res.status(404).send('User not found');
              } else {
                  const userLevel = userResults[0].userLevel;
                  let sql;
                  if (userLevel === 2) {
                      sql = 'SELECT complaintID, title, complaint FROM complaints WHERE complaintID = ?';
                  } else {
                      sql = 'SELECT * FROM complaints WHERE complaintID = ?';
                  }

                  db.query(sql, [compID], (err, results) => {
                      if (err) {
                          console.error('Error retrieving complaints:', err);
                          res.status(500).send('Failed to retrieve complaints');
                      } else {
                          // console.log('Complaints retrieved successfully:', results);
                          res.status(200).json(results);
                      }
                  });
              }
          });
      }
  });
});
