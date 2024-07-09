//  Imports ----------------------------------------------------
import express from "express";
import mysql from "mysql";
import cors from "cors";
import dotenv from "dotenv";
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

// Serve static files from the "public" folder
app.use(express.static(path.join(__dirname, 'public')));



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
// app.post("/login", (req, res) => {
//   const { userName, password } = req.body;
//   if (!userName || !password) {
//     return res.status(400).send("Username and password are required.");
//   }
//   const query =
//     "SELECT userID, userName FROM users WHERE userName = ? AND password = ?";
//   db.query(query, [userName, password], (err, results) => {
//     if (err) {
//       console.error("Error querying the database:", err);
//       return res.status(500).send("Error querying the database.");
//     }
//     if (results.length > 0) {
//       const userId = results[0].userID;
//       res.json({ message: "Login successful", userId, userName });
//       return res.json({ loginStatus: true });
//     } else {
//       res.status(401).send("Invalid username or password.");
//       return res.json({ loginStatus: false, Error: "Wrong Credentials" });
//     }
//   });
// });

//

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
      return res.json({ message: "Login successful", userId, userName, loginStatus: true });
    } else {
      return res.status(401).json({ loginStatus: false, Error: "Wrong Credentials" });
    }
  });
});
//

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
// app.get("/getComplaintByUserId/:userID", (req, res) => {
//   console.log("Route /getComplaintByUserId/:userID hit");
//   const userID = req.params.userID;
//   console.log("userID:", userID);
//   const sql = `
//       SELECT DISTINCT c.*, 
//                       t.transactionId, t.createdBy, t.sentTo, t.timeAndDate, t.remark, t.status AS transactionStatus,
//                       uc.userName AS createdByUsername,
//                       us.userName AS sentToUsername,
//                       ch.userName AS currentHolderUsername
//       FROM complaints c
//       LEFT JOIN transactions t ON c.complaintID = t.complaintID
//       LEFT JOIN users uc ON t.createdBy = uc.userID
//       LEFT JOIN users us ON t.sentTo = us.userID
//       LEFT JOIN users ch ON c.currentHolder = ch.userID
//       WHERE c.complaintID IN (
//           SELECT complaintID
//           FROM transactions
//           WHERE createdBy = ? OR sentTo = ?
//       )`;
  
//   db.query(sql, [userID, userID], (err, complaintResults) => {
//     if (err) {
//       console.error("Error retrieving complaints and transactions:", err);
//       return res.status(500).send("Failed to retrieve complaints and transactions");
//     }
//     console.log("Complaint Results:", complaintResults);
//     const resultsArray = Array.isArray(complaintResults) ? complaintResults : [complaintResults];
//     const complaintsMap = {};
//     resultsArray.forEach((row) => {
//       if (!complaintsMap[row.complaintID]) {
//         complaintsMap[row.complaintID] = {
//           complaintID: row.complaintID,
//           createdByName: row.createdByName,
//           pfNo: row.pfNo,
//           title: row.title,
//           complaint: row.complaint,
//           department: row.department,
//           website: row.website,
//           module: row.module,
//           division: row.division,
//           document: row.document,
//           status: row.status,
//           currentHolder: row.currentHolder,
//           currentHolderUsername: row.currentHolderUsername,
//           transactions: [],
//         };
//       }
//       if (row.transactionId) {
//         complaintsMap[row.complaintID].transactions.push({
//           transactionId: row.transactionId,
//           createdBy: row.createdBy,
//           sentTo: row.sentTo,
//           createdByUsername: complaintsMap[row.complaintID].transactions.length === 0 ? row.createdByName : row.createdByUsername,
//           sentToUsername: row.sentToUsername,
//           timeAndDate: row.timeAndDate,
//           remark: row.remark,
//           status: row.transactionStatus,
//         });
//       }
//     });
    
//     const complaintsList = Object.values(complaintsMap);
//     res.status(200).json(complaintsList);
//   });
// });
app.get("/getComplaintByUserId/:userID", (req, res) => {
  console.log("Route /getComplaintByUserId/:userID hit");
  const userID = req.params.userID;
  console.log("userID:", userID);
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
    WHERE t.createdBy = ? OR t.sentTo = ?
    ORDER BY t.timeAndDate DESC`;

  db.query(sql, [userID, userID], (err, complaintResults) => {
    if (err) {
      console.error("Error retrieving complaints and transactions:", err);
      return res.status(500).send("Failed to retrieve complaints and transactions");
    }
    console.log("Complaint Results:", complaintResults);
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

    // Convert complaintsMap to an array of values
    const complaintsList = Object.values(complaintsMap);
    console.log("complaintsMap" + complaintsMap);
    // Sort transactions within each complaint by timeAndDate in descending order
    complaintsList.forEach(complaint => {
      complaint.transactions.sort((a, b) => new Date(b.timeAndDate) - new Date(a.timeAndDate));
    });

    res.status(200).json(complaintsList);
  });
});


// get complaints on the basis of get complaints of current holder ------------------------
app.get("/getComplaintsByCurrentHolder/:userID", (req, res) => {
  console.log("Route /getComplaintsByCurrentHolder/:userID hit");
  const userID = req.params.userID;
  console.log("userID:", userID);
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
    WHERE c.currentHolder = ? AND (c.status = 'pending' OR c.status = 'In Progress')
    ORDER BY t.timeAndDate DESC`;

  db.query(sql, [userID], (err, complaintResults) => {
    if (err) {
      console.error("Error retrieving complaints and transactions:", err);
      return res.status(500).send("Failed to retrieve complaints and transactions");
    }
    console.log("Complaint Results:", complaintResults);
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

    // Convert complaintsMap to an array of values
    const complaintsList = Object.values(complaintsMap);

    // Sort transactions within each complaint by timeAndDate in descending order
    complaintsList.forEach(complaint => {
      complaint.transactions.sort((a, b) => new Date(b.timeAndDate) - new Date(a.timeAndDate));
    });

    res.status(200).json(complaintsList);
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
// app.get("/getComplaintById/:complaintID", (req, res) => {
//   const complaintID = req.params.complaintID;

//   const sql = `
//     SELECT DISTINCT c.*, 
//                     t.transactionId, t.createdBy, t.sentTo, t.timeAndDate, t.remark, t.status AS transactionStatus,
//                     uc.userName AS createdByUsername,
//                     us.userName AS sentToUsername,
//                     ch.userName AS currentHolderUsername
//     FROM complaints c
//     LEFT JOIN transactions t ON c.complaintID = t.complaintID
//     LEFT JOIN users uc ON t.createdBy = uc.userID
//     LEFT JOIN users us ON t.sentTo = us.userID
//     LEFT JOIN users ch ON c.currentHolder = ch.userID
//     WHERE c.complaintID = ?
//   `;

//   db.query(sql, [complaintID], (err, complaintResults) => {
//     if (err) {
//       console.error("Error retrieving complaints and transactions:", err);
//       return res.status(500).send("Failed to retrieve complaints and transactions");
//     }
//     console.log("Complaint Results:", complaintResults);
//     const resultsArray = Array.isArray(complaintResults) ? complaintResults : [complaintResults];
//     const complaintsMap = {};
//     resultsArray.forEach((row) => {
//       if (!complaintsMap[row.complaintID]) {
//         complaintsMap[row.complaintID] = {
//           complaintID: row.complaintID,
//           createdByName: row.createdByName,
//           pfNo: row.pfNo,
//           title: row.title,
//           complaint: row.complaint,
//           department: row.department,
//           website: row.website,
//           module: row.module,
//           division: row.division,
//           document: row.document,
//           status: row.status,
//           currentHolder: row.currentHolder,
//           currentHolderUsername: row.currentHolderUsername,
//           transactions: [],
//         };
//       }
//       if (row.transactionId) {
//         complaintsMap[row.complaintID].transactions.push({
//           transactionId: row.transactionId,
//           createdBy: row.createdBy,
//           sentTo: row.sentTo,
//           createdByUsername: complaintsMap[row.complaintID].transactions.length === 0 ? row.createdByName : row.createdByUsername,
//           sentToUsername: row.sentToUsername,
//           timeAndDate: row.timeAndDate,
//           remark: row.remark,
//           status: row.transactionStatus,
//         });
//       }
//     });

//     const complaintsList = Object.values(complaintsMap);
//     res.status(200).json(complaintsList);
//   });
// });

app.get("/getComplaintById/:complaintID", (req, res) => {
  const complaintID = req.params.complaintID;

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
    WHERE c.complaintID = ?
    ORDER BY t.timeAndDate DESC`;  // Order by timeAndDate in descending order

  db.query(sql, [complaintID], (err, complaintResults) => {
    if (err) {
      console.error("Error retrieving complaints and transactions:", err);
      return res.status(500).send("Failed to retrieve complaints and transactions");
    }
    console.log("Complaint Results:", complaintResults);
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

    // Sort transactions within the complaint by timeAndDate in descending order
    if (complaintsMap[complaintID]) {
      complaintsMap[complaintID].transactions.sort((a, b) => new Date(b.timeAndDate) - new Date(a.timeAndDate));
    }

    // Convert complaintsMap to an array of values
    const complaintsList = Object.values(complaintsMap);
    
    res.status(200).json(complaintsList);
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
  console.log(req.body);
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
// app.get("/getComplaintByPfNo/:pfNo", (req, res) => {
//   const pfNo = req.params.pfNo;
//   console.log(pfNo);
//   const sql = `
//     SELECT DISTINCT c.*, 
//                     t.transactionId, t.createdBy, t.sentTo, t.timeAndDate, t.remark, t.status AS transactionStatus,
//                     uc.userName AS createdByUsername,
//                     us.userName AS sentToUsername,
//                     ch.userName AS currentHolderUsername
//     FROM complaints c
//     LEFT JOIN transactions t ON c.complaintID = t.complaintID
//     LEFT JOIN users uc ON t.createdBy = uc.userID
//     LEFT JOIN users us ON t.sentTo = us.userID
//     LEFT JOIN users ch ON c.currentHolder = ch.userID
//     WHERE c.pfNo = ?
//   `;

//   db.query(sql, [pfNo], (err, complaintResults) => {
//     if (err) {
//       console.error("Error retrieving complaints and transactions:", err);
//       return res.status(500).send("Failed to retrieve complaints and transactions");
//     }
//     console.log("Complaint Results:", complaintResults);
//     const resultsArray = Array.isArray(complaintResults) ? complaintResults : [complaintResults];
//     const complaintsMap = {};
//     resultsArray.forEach((row) => {
//       if (!complaintsMap[row.complaintID]) {
//         complaintsMap[row.complaintID] = {
//           complaintID: row.complaintID,
//           createdByName: row.createdByName,
//           pfNo: row.pfNo,
//           title: row.title,
//           complaint: row.complaint,
//           department: row.department,
//           website: row.website,
//           module: row.module,
//           division: row.division,
//           document: row.document,
//           status: row.status,
//           currentHolder: row.currentHolder,
//           currentHolderUsername: row.currentHolderUsername,
//           transactions: [],
//         };
//       }
//       if (row.transactionId) {
//         complaintsMap[row.complaintID].transactions.push({
//           transactionId: row.transactionId,
//           createdBy: row.createdBy,
//           sentTo: row.sentTo,
//           createdByUsername: complaintsMap[row.complaintID].transactions.length === 0 ? row.createdByName : row.createdByUsername,
//           sentToUsername: row.sentToUsername,
//           timeAndDate: row.timeAndDate,
//           remark: row.remark,
//           status: row.transactionStatus,
//         });
//       }
//     });

//     const complaintsList = Object.values(complaintsMap);
//     res.status(200).json(complaintsList);
//   });
// });
app.get("/getComplaintByPfNo/:pfNo", (req, res) => {
  const pfNo = req.params.pfNo;
  console.log(pfNo);
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
    WHERE c.pfNo = ?
    ORDER BY t.timeAndDate DESC`;  // Order by timeAndDate in descending order

  db.query(sql, [pfNo], (err, complaintResults) => {
    if (err) {
      console.error("Error retrieving complaints and transactions:", err);
      return res.status(500).send("Failed to retrieve complaints and transactions");
    }
    console.log("Complaint Results:", complaintResults);
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

    // Sort transactions within each complaint by timeAndDate in descending order
    Object.values(complaintsMap).forEach(complaint => {
      complaint.transactions.sort((a, b) => new Date(b.timeAndDate) - new Date(a.timeAndDate));
    });

    // Convert complaintsMap to an array of values
    const complaintsList = Object.values(complaintsMap);
    
    res.status(200).json(complaintsList);
  });
});



// Activate user API
app.put('/activateUser/:userID', (req, res) => {
  const userID = req.params.userID;
  const sql = 'UPDATE users SET isActiveUser = ? WHERE userID = ?';
  
  db.query(sql, ['Y', userID], (err, result) => {
    if (err) {
      console.error('Error activating user:', err);
      res.status(500).send('Failed to activate user');
    } else if (result.affectedRows === 0) {
      res.status(404).send('User not found');
    } else {
      res.status(200).send('User activated successfully');
    }
  });
});

// Deactivate user API
app.put('/deactivateUser/:userID', (req, res) => {
  const userID = req.params.userID;
  const sql = 'UPDATE users SET isActiveUser = ? WHERE userID = ?';
  
  db.query(sql, ['N', userID], (err, result) => {
    if (err) {
      console.error('Error deactivating user:', err);
      res.status(500).send('Failed to deactivate user');
    } else if (result.affectedRows === 0) {
      res.status(404).send('User not found');
    } else {
      res.status(200).send('User deactivated successfully');
    }
  });
});


app.get('/getUserDetails/:userId', (req, res) => {
  const userId = req.params.userId;
  const sql = 'SELECT userID, userName, email, contact, userLevel, isActiveUser FROM users WHERE userID = ?';

  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error('Error fetching user details:', err);
      return res.status(500).json({ error: 'Error fetching user details' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json(results[0]);
  });
});


// Toggle user activation API
app.put('/toggleUserActivation/:userID', (req, res) => {
  const userID = req.params.userID;
  const newStatus = req.body.newStatus; // 'Y' or 'N'

  const sql = 'UPDATE users SET isActiveUser = ? WHERE userID = ?';
  db.query(sql, [newStatus, userID], (err, result) => {
    if (err) {
      console.error('Error toggling user activation:', err);
      res.status(500).send('Failed to toggle user activation');
    } else if (result.affectedRows === 0) {
      res.status(404).send('User not found');
    } else {
      res.status(200).send('User activation toggled successfully');
    }
  });
});


// get resolved complaints -----------------------------------------------
app.get("/getResolvedComplaintsByCurrentHolder/:userID", (req, res) => {
  console.log("Route /getResolvedComplaintsByCurrentHolder/:userID hit");
  const userID = req.params.userID;
  console.log("userID:", userID);
  console.log("hello")
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
    WHERE c.currentHolder = ? AND c.status = 'Resolved'
    ORDER BY t.timeAndDate DESC`;

  db.query(sql, [userID], (err, complaintResults) => {
    if (err) {
      console.error("Error retrieving resolved complaints:", err);
      return res.status(500).send("Failed to retrieve resolved complaints");
    }
    console.log("Resolved Complaint Results:", complaintResults);
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

    // Convert complaintsMap to an array of values
    const complaintsList = Object.values(complaintsMap);

    // Sort transactions within each complaint by timeAndDate in descending order
    complaintsList.forEach(complaint => {
      complaint.transactions.sort((a, b) => new Date(b.timeAndDate) - new Date(a.timeAndDate));
    });

    res.status(200).json(complaintsList);
  });
});
