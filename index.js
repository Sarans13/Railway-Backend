//  Imports ----------------------------------------------------
import express from "express";
import mysql from "mysql";
import cors from "cors";
import dotenv from "dotenv";
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';


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

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/')
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = crypto.randomBytes(16).toString('hex');
    cb(null, uniqueSuffix + path.extname(file.originalname))
  }
});

const upload = multer({ storage: storage });

// Endpoint to validate username and password -------------------
app.post("/login", (req, res) => {
  const { userName, password } = req.body;
  if (!userName || !password) {
    return res.status(400).send("Username and password are required.");
  }
  const query =
    "SELECT userID, userName FROM users WHERE userName = ? AND password = ?";
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
app.post('/addComplaint', upload.single('document'), async (req, res) => {
	const complaint = req.body;
	const file = req.file;

	try {
		const sqlInsertComplaint = `
      INSERT INTO complaints (createdByName, pfNo, title, complaint, department, website, module, division, document, status, currentHolder)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 1)
    `;

		db.query(
			sqlInsertComplaint,
			[
				complaint.createdByName,
				complaint.pfNo,
				complaint.title,
				complaint.complaint,
				complaint.department,
				complaint.website,
				complaint.module,
				complaint.division,
				file ? file.filename : null,
			],
			(err, result) => {
				if (err) {
					console.error('Error inserting data into complaints:', err);
					return res.status(500).send('Failed to insert data');
				}

				const complaintID = result.insertId;
				console.log('Complaint inserted successfully with ID:', complaintID);

				const sqlInsertTransaction = `
          INSERT INTO transactions (complaintID, createdBy, sentTo, remark, status)
          VALUES (?, ?, ?, ?, 'pending')
        `;

				db.query(
					sqlInsertTransaction,
					[complaintID, complaint.pfNo, 1, complaint.complaint],
					(err, result) => {
						if (err) {
							console.error('Error inserting data into transactions:', err);
							return res.status(500).send('Failed to insert transaction');
						}

						console.log('Transaction inserted successfully:', result);
						res.status(200).json({
							message: 'Complaint and transaction inserted successfully',
							complaintID: complaintID,
							createdBy: complaint.pfNo,
							status: 'pending',
						});
					}
				);
			}
		);
	} catch (err) {
		console.error('Error processing complaint:', err);
		res.status(500).send('Failed to process complaint');
	}
});

// Define a route to handle retrieving complaints by userID --------------------------------
app.get("/getComplaintByUserId/:userID", (req, res) => {
  const userID = req.params.userID;
  const sql = `
      SELECT DISTINCT c.*, 
                      t.transactionId, t.createdBy, t.sentTo, t.timeAndDate, t.remark, t.status AS transactionStatus,
                      uc.userName AS createdByUsername,
                      us.userName AS sentToUsername,
                      ch.userName AS currentHolderUsername
      FROM complaints c
      LEFT JOIN transactions t ON c.complaintID = t.complaintID
      LEFT JOIN users uc ON t.createdBy = uc.userID
      LEFT JOIN users us ON t.sentTo = us.userID
      LEFT JOIN users ch ON c.currentHolder = ch.userID
      WHERE c.complaintID IN (
          SELECT complaintID
          FROM transactions
          WHERE createdBy = ? OR sentTo = ?
      )`;
  
  db.query(sql, [userID, userID], (err, complaintResults) => {
    if (err) {
      console.error("Error retrieving complaints and transactions:", err);
      res.status(500).send("Failed to retrieve complaints and transactions");
    } else {
      // Ensure complaintsResults is always an array
      const resultsArray = Array.isArray(complaintResults) ? complaintResults : [complaintResults];
      
      const complaintsMap = {};
      resultsArray.forEach((row) => {
        if (!complaintsMap[row.complaintID]) {
          complaintsMap[row.complaintID] = {
            complaintID: row.complaintID,
            createdByName: row.createdByName,
            pfNo: row.pfNo,
            title: row.title,
            complaint: row.complaint,
            department: row.department,
            website: row.website,
            module: row.module,
            division: row.division,
            document: row.document,
            status: row.status,
            currentHolder: row.currentHolder,
            currentHolderUsername: row.currentHolderUsername,
            transactions: [],
          };
        }
        if (row.transactionId) {
          complaintsMap[row.complaintID].transactions.push({
            transactionId: row.transactionId,
            createdBy: row.createdBy,
            sentTo: row.sentTo,
            createdByUsername: complaintsMap[row.complaintID].transactions.length === 0 ? row.createdByName : row.createdByUsername,
            sentToUsername: row.sentToUsername,
            timeAndDate: row.timeAndDate,
            remark: row.remark,
            status: row.transactionStatus,
          });
        }
      });
      
      const complaintsList = Object.values(complaintsMap);
      res.status(200).json(complaintsList);
    }
  });
});


// add user --------------------------------------------------------------------------------
app.post("/addUser", (req, res) => {
  const {
    pf,
    userName,
    email,
    contact,
    password,
    userLevel,
    isActiveUser = "Y",
  } = req.body;
  const sql = `
      INSERT INTO users (pf, userName, email, contact, password, userLevel, isActiveUser)
      VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  const values = [
    pf,
    userName,
    email,
    contact,
    password,
    userLevel,
    isActiveUser,
  ];
  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("Error adding user:", err);
      res.status(500).json({ error: "Failed to add user" });
      return;
    }
    res
      .status(201)
      .json({ message: "User added successfully", userID: result.insertId });
  });
});

// Define a route to handle retrieving complaints by complaintID ----------------------------
app.get("/getComplaintByComplaintId/:id", (req, res) => {
  const compID = req.params.id;
  const sql = "SELECT title, complaint, status, complaintID FROM complaints WHERE complaintID = ?";
  
  db.query(sql, [compID], (err, results) => {
    if (err) {
      console.error("Error retrieving complaints:", err);
      res.status(500).send("Failed to retrieve complaints");
    } else if (results.length === 0) {
      res.status(404).send("Complaint not found");
    } else {
      // Wrap results in an array
      const response = Array.isArray(results) ? results : [results];
      res.status(200).json(response);
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
  const { remark, createdBy, sentTo, complaintID } = req.body;
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
      const updateCurrentHolderQuery =
        "UPDATE complaints SET currentHolder = ? WHERE complaintID = ?";
      const updateCurrentHolderValues = [sentTo, complaintID];
      db.query(
        updateCurrentHolderQuery,
        updateCurrentHolderValues,
        (err, updateHolderResult) => {
          if (err) {
            console.error(
              "Error updating currentHolder in complaints table:",
              err
            );
            res
              .status(500)
              .json({
                error: "Error updating currentHolder in complaints table",
              });
            return;
          }
          res.status(200).json({
            message:
              "Complaint forwarded successfully, status updated, and currentHolder updated",
          });
        }
      );
    });
  });
});

// Resolve a complaint ---------------------------------------------------------------------------------
app.post("/resolveComplaint", (req, res) => {
  const { remark, createdBy, sentTo, complaintID } = req.body;
  const transactionQuery =
    "INSERT INTO transactions (complaintID, createdBy, sentTo, remark, status, id) VALUES (?, ?, ?, ?, ?)";
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
      const updateCurrentHolderQuery =
        "UPDATE complaints SET currentHolder = ? WHERE complaintID = ?";
      const updateCurrentHolderValues = [createdBy, complaintID];
      db.query(
        updateCurrentHolderQuery,
        updateCurrentHolderValues,
        (err, updateHolderResult) => {
          if (err) {
            console.error(
              "Error updating currentHolder in complaints table:",
              err
            );
            res
              .status(500)
              .json({
                error: "Error updating currentHolder in complaints table",
              });
            return;
          }
          res.status(200).json({
            message:
              "Complaint resolved successfully, status updated, and currentHolder set",
          });
        }
      );
    });
  });
});

// Fetch a complaint by pfNo of the employee -----------------------------------
app.get('/getComplaintDetailsByPfNo/:pfNo', (req, res) => {
  const pfNo = req.params.pfNo;
  const sql = 'SELECT title, complaint, status, complaintID FROM railway.complaints WHERE pfNo = ?';
  db.query(sql, [pfNo], (err, results) => {
    if (err) {
      console.error('Error retrieving complaint details by pfNo:', err);
      res.status(500).send('Failed to retrieve complaint details');
    } else {
      // Wrap results in an array if not already
      const response = Array.isArray(results) ? results : [results];
      res.status(200).json(response);
    }
  });
});


