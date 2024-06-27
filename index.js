//  Imports ----------------------------------------------------
import express from "express";
import mysql from "mysql";
import cors from "cors";
import dotenv from "dotenv";

// Initialize the app ------------------------------------------
const app = express();
const port = process.env.PORT || 3003;
app.listen(port, () => {
  console.log("Backend is running!! at " + port);
});
app.use(express.json());
app.use(cors());
// load the environment variable from the file
dotenv.config();

// Connect with the database -----------------------------------
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});
db.connect((err) => {
  console.log(process.env.DB_NAME);
  if (err) {
    console.error("Database connection failed: " + err.stack);
    return;
  }
  console.log("Connected to database.");
});

// Endpoint to validate username and password -------------------
app.post("/login", (req, res) => {
  const { userName, password } = req.body;
  if (!userName || !password) {
    return res.status(400).send("Username and password are required.");
  }
  const query = "SELECT userID, userName FROM users WHERE userName = ? AND password = ?";
  db.query(query, [userName, password], (err, results) => {
    if (err) {
      console.error("Error querying the database:", err);
      return res.status(500).send("Error querying the database.");
    }
    if (results.length > 0) {
      const userId = results[0].userID;
      res.json({ message: "Login successful", userId, userName });
    } else {
      res.status(401).send("Invalid username or password.");
    }
  });
});

// create a complaint by the employee -----------------------------
app.post("/addComplaint", (req, res) => {
  const complaint = req.body;

  const sqlInsertComplaint = `INSERT INTO complaints 
    (userName, userID, title, complaint, department, website, module, division, document, status) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`;

  db.query(
    sqlInsertComplaint,
    [
      complaint.userName,
      complaint.userID,
      complaint.title,
      complaint.complaint,
      complaint.department,
      complaint.website,
      complaint.module,
      complaint.division,
      complaint.document,
    ],
    (err, result) => {
      if (err) {
        console.error("Error inserting data into complaints:", err);
        res.status(500).send("Failed to insert data");
      } else {
        const complaintID = result.insertId;
        console.log("Complaint inserted successfully with ID:", complaintID);

        const sqlInsertTransaction = `INSERT INTO transactions 
            (complaintID, createdBy, sentTo, remark, status) 
            VALUES (?, ?, ?, ?, ?, ?, 'pending')`;

        db.query(
          sqlInsertTransaction,
          [complaintID, complaint.userID, complaint.userName, 1, 'admin', complaint.complaint],
          (err, result) => {
            if (err) {
              console.error("Error inserting data into transactions:", err);
              res.status(500).send("Failed to insert transaction");
            } else {
              console.log("Transaction inserted successfully:", result);
              res.status(200).send({
                message: "Complaint and transaction inserted successfully",
                complaintID: complaintID,
                userID: complaint.userID,
                status: "pending",
              });
            }
          }
        );
      }
    }
  );
});

// Define a route to handle retrieving complaints by userID --------------------------------
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
              SELECT complaintID 
              FROM transactions 
              WHERE createdBy = ? OR sentTo = ?`;
              db.query(sql, [userID, userID], (err, transactionResults) => {
                  if (err) {
                      console.error('Error retrieving transaction complaint IDs:', err);
                      res.status(500).send('Failed to retrieve transaction complaint IDs');
                  } else {
                      if (transactionResults.length === 0) {
                          res.status(404).send('No transactions found for the given user.');
                      } else {
                          const complaintIDs = transactionResults.map(row => row.complaintID);
                          sql = `
                          SELECT c.*, 
                                 t.transactionId, t.createdBy, t.sentTo, t.timeAndDate, t.remark, t.status AS transactionStatus,
                                 uc.userName AS createdByUsername,
                                 us.userName AS sentToUsername
                          FROM complaints c
                          LEFT JOIN transactions t ON c.complaintID = t.complaintID
                          LEFT JOIN users uc ON t.createdBy = uc.userID
                          LEFT JOIN users us ON t.sentTo = us.userID
                          WHERE c.complaintID IN (?)`;
                          db.query(sql, [complaintIDs], (err, complaintResults) => {
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
                                              createdByUsername: row.createdByUsername,
                                              sentToUsername: row.sentToUsername,
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
          }
      }
  });
});



// Define a route to handle retrieving complaints by complaintID ----------------------------
app.get("/getComplaintByComplaintId/:id", (req, res) => {
    const compID = req.params.id;
    
    const sql = "SELECT title, description, status FROM complaints WHERE complaintID = ?";
  
    db.query(sql, [compID], (err, results) => {
      if (err) {
        console.error("Error retrieving complaints:", err);
        res.status(500).send("Failed to retrieve complaints");
      } else if (results.length === 0) {
        res.status(404).send("Complaint not found");
      } else {
        res.status(200).json(results[0]);
      }
    });
  });

//get level 0 and level 1 users -----------------------------------------------------------
app.get("/getLevel0and1", (req, res) => {
  const query = "SELECT userID, userName FROM users WHERE userLevel IN (0, 1)";

  db.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching users:", err);
      res.status(500).json({ error: "Error fetching users" });
      return;
    }
    res.json(results);
  });
});

//forward a transaction from one level to another -------------------------------------------
// Route Handler for forwarding a complaint
app.post("/forwardComplaint", (req, res) => {
  const {
    remark,
    createdBy,
    sentTo,
    complaintID
  } = req.body;

  const transactionQuery =
    "INSERT INTO transactions (complaintID, createdBy, sentTo, remark, status) VALUES (?, ?, ?, ?, ?)";
  const transactionValues = [
    complaintID,
    createdBy,
    sentTo,
    remark,
    "In Progress",
  ];

  db.query(transactionQuery, transactionValues, (err, transactionResult) => {
    if (err) {
      console.error("Error inserting into transactions table:", err);
      res
        .status(500)
        .json({ error: "Error inserting into transactions table" });
      return;
    }

    const updateStatusQuery =
      "UPDATE complaints SET status = ? WHERE complaintID = ?";
    const updateStatusValues = ["In Progress", complaintID];

    db.query(updateStatusQuery, updateStatusValues, (err, updateResult) => {
      if (err) {
        console.error("Error updating complaints table:", err);
        res.status(500).json({ error: "Error updating complaints table" });
        return;
      }

      res
        .status(200)
        .json({
          message: "Complaint forwarded successfully and status updated",
        });
    });
  });
});

// Resolve a complaint ---------------------------------------------------------------------------------
app.post("/resolveComplaint", (req, res) => {
  const { remark, createdBy, sentTo, complaintID } = req.body;
  const transactionQuery =
    "INSERT INTO transactions (complaintID, createdBy, sentTo, remark, status) VALUES (?, ?, ?, ?, ?)";
  const transactionValues = [
    complaintID,
    createdBy,
    sentTo,
    remark,
    "Resolved",
  ];

  db.query(transactionQuery, transactionValues, (err, transactionResult) => {
    if (err) {
      console.error("Error inserting into transactions table:", err);
      res
        .status(500)
        .json({ error: "Error inserting into transactions table" });
      return;
    }
    const updateStatusQuery =
      "UPDATE complaints SET status = ? WHERE complaintID = ?";
    const updateStatusValues = ["Resolved", complaintID];

    db.query(updateStatusQuery, updateStatusValues, (err, updateResult) => {
      if (err) {
        console.error("Error updating complaints table:", err);
        res.status(500).json({ error: "Error updating complaints table" });
        return;
      }

      res.status(200).json({
        message: "Complaint forwarded successfully and status updated",
      });
    });
  });
});
