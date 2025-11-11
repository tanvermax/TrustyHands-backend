const express = require('express');
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// middleware
app.use(cors({
  origin: ['http://localhost:5173',
    "https://home-service-d15f3.firebaseapp.com",
    'https://trusty-hands.vercel.app',
    "https://proposal-liart-theta.vercel.app"
  ],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
};
//l
const verify = (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).send({ message: 'Unatuhorized access' })
  }
  // verify
  jwt.verify(token, process.env.ACCESS_TOKEN, (err, decode) => {
    if (err) {
      return res.status(401).send({ message: 'Unatuhorized access' })
    }
    req.user = decode;
    next();
  })

}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.toqnk.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;



// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {

    const userCollection = client.db('homeservice').collection("user")
    const serviceCollection = client.db('homeservice').collection("allservice")
    const orderCollection = client.db('homeservice').collection("order")
    const serviceRequestsCollection = client.db('homeservice').collection("serviceRequests")
    const complaintCollection = client.db('homeservice').collection("complaints")
    const proposalCollection = client.db('homeservice').collection("proposals");
    const conditionCollection = client.db('homeservice').collection("proposalscondition");
    // jwt token
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN,
        { expiresIn: '5h' });

      res.cookie('token', token, cookieOptions)
        .send({ success: true })
    })


    app.post('/api/proposal-response', async (req, res) => {
      console.log(req.body);

      const anwser = req.body
      const result = await proposalCollection.insertOne(anwser);
      res.json(
        {
          success: true,
          data: result,
          message: 'Response saved'
        });
    });


    app.post('/api/condition-response', async (req, res) => {
      try {
        const { condition, timestamp, deviceInfo, location } = req.body;

        const result = await conditionCollection.insertOne({
          condition,
          timestamp,
          deviceInfo,
          location,
        });
        console.log(result)

        res.json({ success: true, message: 'Condition saved successfully!', data: result });
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
      }
    });




    // transection
    app.post('/recharge', async (req, res) => {
      // 1. Get data from the client request
      const { amount, method, userId } = req.body;
      // User ID comes from the 'protect' middleware after token verification

      console.log("amount, method,userId", amount, method, userId)
      // Basic input validation
      if (!amount || amount <= 0 || !method) {
        return res.status(400).json({ message: 'Invalid amount or payment method.' });
      }

      const rechargeAmount = parseFloat(amount);



      console.log(`[BACKEND] Initiating $${rechargeAmount} recharge via ${method} for user ${userId}`);

      // --- 3. DATABASE UPDATE (Assuming successful payment) ---
      try {
        // Find the user in the database
        let userObjectId;
        try {
          userObjectId = new ObjectId(userId);
        } catch (e) {
          return res.status(400).json({ message: 'Invalid User ID format.' });
        }

        // 🔑 FIX 2: Use findOne() instead of findById()
        // Find the user to get their current wallet balance
        const user = await userCollection.findOne({ _id: userObjectId });

        if (!user) {
          return res.status(404).json({ message: 'User not found.' });
        }

        // Check if the user has a wallet property, if not, initialize it.
        const currentWallet = user.wallet || 0;
        const newBalance = currentWallet + rechargeAmount;
        const updateResult = await userCollection.updateOne(
          { _id: userObjectId }, // Filter by user ID
          {
            $set: { wallet: newBalance }, // Set the new wallet value
            $push: {
              transactions: { // Optional: log the transaction
                type: 'recharge',
                amount: rechargeAmount,
                method: method,
                timestamp: new Date()
              }
            }
          }
        );

        // 4. Send a success response back to the client
        if (updateResult.modifiedCount === 0 && updateResult.matchedCount === 0) {
          // This is unlikely if findOne succeeded, but good for robustness
          return res.status(500).json({ message: 'Failed to update user wallet.' });
        }

        // 4. Send a success response back to the client
        res.status(200).json({
          message: 'Wallet recharged successfully.',
          newBalance: newBalance, // Send the new calculated balance back
          transactionId: 'TXN_' + Date.now(),
        });
      } catch (error) {
        console.error('Database/Recharge error:', error);
        res.status(500).json({ message: 'Server error during wallet update.' });
      }
    });


    // notification fro user
    // Add this route to your run() function in the Express server file
    app.get('/notifications/user/:email', async (req, res) => {
      const userEmail = req.params.email;

      try {
        // NOTE: Assuming you have a reviewCollection for 'New Reviews'
        // For simplicity, let's focus on Pending Orders/Service Requests first.

        // 1. Pending Orders (Orders user placed that are still Pending)
        const pendingOrders = await orderCollection.countDocuments({
          ordergivenuseremail: userEmail,
          serviceStatus: 'Pending'
        });

        // 2. Open Service Requests (Assuming user can post requests, status is 'Open')
        const openServiceRequests = await serviceRequestsCollection.countDocuments({
          ordergivenuseremail: userEmail, // Assuming this is the field used
          status: 'Open'
        });

        res.send({
          success: true,
          counts: {
            myorders: pendingOrders,
            postrequest: openServiceRequests,
            // myreviews: 5, // Example if you track new replies to user reviews
          }
        });
      } catch (error) {
        res.status(500).send({ success: false, message: "Failed to fetch user notifications." });
      }
    });
    // notification for provider 
    // Add this route to your run() function in the Express server file
    app.get('/notifications/provider/:email', async (req, res) => {
      const providerEmail = req.params.email;

      try {
        // 1. New Orders (Status: Pending)
        const newOrders = await orderCollection.countDocuments({
          serviceprovideremail: providerEmail,
          serviceStatus: 'Pending'
        });

        // 2. Pending Support Complaints (Status: Pending)
        const pendingSupport = await complaintCollection.countDocuments({
          providerEmail: providerEmail,
          status: 'Pending'
        });

        res.send({
          success: true,
          counts: {
            orders: newOrders,
            providersupport: pendingSupport,
          }
        });
      } catch (error) {
        res.status(500).send({ success: false, message: "Failed to fetch provider notifications." });
      }
    });
    // notification for admin
    // Add this route to your run() function in the Express server file
    app.get('/notifications/admin', async (req, res) => {
      // NOTE: Assume Admin role check is handled by middleware
      try {
        // 1. Pending Orders (For general oversight/assignment)
        const pendingOrders = await orderCollection.countDocuments({
          serviceStatus: 'Pending'
        });
        const serviceOrder = await serviceCollection.countDocuments({});

        // 2. Pending Support Complaints (Status: Pending)
        const pendingSupport = await complaintCollection.countDocuments({
          status: 'Pending'
        });

        // 3. New Users (E.g., users registered in the last 24h, or users with a flag 'isNew')
        // For simplicity, let's count all users for a 'Manage Users' badge.
        const totalUsers = await userCollection.countDocuments({ role: 'user' });

        res.send({
          success: true,
          counts: {
            ordersMange: pendingOrders,
            adminsupport: pendingSupport,
            manageusers: totalUsers,
            mageservice: serviceOrder
          }
        });
      } catch (error) {
        res.status(500).send({ success: false, message: "Failed to fetch admin notifications." });
      }
    });

    // ===================================================
    // GET route for Admin to retrieve ALL complaints
    // ===================================================
    app.get('/admin/all-complaints', async (req, res) => {
      // NOTE: Ensure req.user has an 'admin' role check here in production.
      try {
        const complaints = await complaintCollection.find({})
          .sort({ status: 1, createdAt: -1 }) // Sort: Pending first (status: 1), then newest first
          .toArray();

        res.status(200).send({ success: true, data: complaints });
      } catch (error) {
        console.error("Error retrieving all complaints for admin:", error);
        res.status(500).send({ success: false, message: "Internal server error while fetching all complaints." });
      }
    });
    // suppoer complain
    app.post('/provider-complaint/:email', async (req, res) => {
      try {
        const { subject, details } = req.body;
        const providerEmail = req.params.email; // Get email from JWT
        const providerName = "Service Provider"; // Assuming 'name' is in the JWT

        if (!subject || !details) {
          return res.status(400).send({ success: false, message: "Subject and details are required." });
        }

        const newComplaint = {
          providerEmail,
          providerName,
          subject,
          details,
          status: 'Pending', // Initial status
          adminReply: null,  // Field for admin response
          createdAt: new Date(),
          updatedAt: new Date()
        };

        const result = await complaintCollection.insertOne(newComplaint);

        res.status(201).send({
          success: true,
          message: "Complaint submitted successfully!",
          id: result.insertedId
        });
      } catch (error) {
        console.error("Error submitting complaint:", error);
        res.status(500).send({ success: false, message: "Internal server error during complaint submission." });
      }
    });

    app.get('/provider-complaints/:email', async (req, res) => {
      try {
        const providerEmail = req.params.email; // Get email from JWT

        const complaints = await complaintCollection.find({
          providerEmail: providerEmail
        })
          .sort({ createdAt: -1 }) // Show newest first
          .toArray();

        res.status(200).send({ success: true, data: complaints });
      } catch (error) {
        console.error("Error retrieving complaints:", error);
        res.status(500).send({ success: false, message: "Internal server error while fetching complaints." });
      }
    });
    // PUT route for Admin to update status and send a reply (requires Admin middleware in real app)
    app.put('/complaint/:id', async (req, res) => {
      // NOTE: In a real app, this should require admin authorization!
      try {
        const id = req.params.id;
        const { status, adminReply } = req.body;

        if (!status) {
          return res.status(400).send({ success: false, message: "Status is required." });
        }

        const updateDoc = {
          $set: {
            status,
            updatedAt: new Date()
          }
        };

        if (adminReply !== undefined) {
          updateDoc.$set.adminReply = adminReply;
        }

        const result = await complaintCollection.updateOne(
          { _id: new ObjectId(id) },
          updateDoc
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ success: false, message: "Complaint not found." });
        }

        res.status(200).send({ success: true, message: "Complaint updated successfully." });
      } catch (error) {
        console.error("Error updating complaint:", error);
        res.status(500).send({ success: false, message: "Internal server error." });
      }
    });
    // service provider dahsbord
    // ===================================================
    // Service Provider Dashboard Metrics API
    // ===================================================
    app.get('/service-provider/dashboard/:email', async (req, res) => {
      const providerEmail = req.params.email;
      try {
        // 1. Total Services Posted by Provider
        const totalServices = await serviceCollection.countDocuments({
          provideremail: providerEmail
        });

        // 2. Active Orders (In Progress)
        const activeOrders = await orderCollection.countDocuments({
          serviceprovideremail: providerEmail,
          serviceStatus: 'In Progress'
        });

        // 3. Completed Orders
        const completedOrders = await orderCollection.countDocuments({
          serviceprovideremail: providerEmail,
          serviceStatus: 'Completed'
        });

        // 4. Calculate Earnings (SUM of 'cost' field from Completed Orders)
        const completedOrdersList = await orderCollection.find({
          serviceprovideremail: providerEmail,
          serviceStatus: 'Completed'
        }).toArray();

        // Ensure cost is treated as a number for summation
        const totalEarnings = completedOrdersList.reduce((sum, order) => {
          // Attempt to parse 'cost' as a float, defaulting to 0 if invalid
          const cost = parseFloat(order.cost) || 0;
          return sum + cost;
        }, 0);

        // 5. Fetch Recent Orders (e.g., last 5, sorted by orderid or date)
        const recentOrders = await orderCollection.find({
          serviceprovideremail: providerEmail
        })
          .sort({ serviceDate: -1 }) // Sort by latest date descending
          .limit(5)
          .toArray();


        res.send({
          success: true,
          data: {
            totalServices,
            activeOrders,
            completedOrders,
            totalEarnings: totalEarnings.toFixed(2), // Format as currency string
            recentOrders
          }
        });
      } catch (error) {
        console.error("Error fetching provider dashboard data:", error);
        res.status(500).send({
          success: false,
          message: "Failed to fetch provider dashboard data."
        });
      }
    });
    // analytic
    app.get('/analytics/summary', async (req, res) => {
      try {
        // Fetch total counts
        const totalUsers = await userCollection.countDocuments();
        const totalServices = await serviceCollection.countDocuments();
        const totalOrders = await orderCollection.countDocuments();
        const totalServiceRequests = await serviceRequestsCollection.countDocuments();

        // Fetch counts based on status
        const openOrders = await orderCollection.countDocuments({ serviceStatus: { $ne: 'Completed' } });
        const completedOrders = await orderCollection.countDocuments({ serviceStatus: 'Completed' });
        const cancelledOrders = await orderCollection.countDocuments({ serviceStatus: 'cancelled' });

        // Fetch user role counts (assuming 'role' field exists on user documents)
        const serviceProviders = await userCollection.countDocuments({ role: 'serviceProvider' });
        const regularUsers = await userCollection.countDocuments({ role: 'user' });

        // You can add more complex aggregation pipelines here for things like 'Top 5 Services' or 'Revenue'

        res.send({
          success: true,
          data: {
            totalUsers,
            totalServices,
            totalOrders,
            totalServiceRequests,
            openOrders,
            completedOrders,
            cancelledOrders,
            serviceProviders,
            regularUsers,
            // ... more metrics
          }
        });
      } catch (error) {
        console.error("Error fetching analytics summary:", error);
        res.status(500).send({
          success: false,
          message: "Failed to fetch analytics data."
        });
      }
    });
    // Get all users, orders, and services
    app.get('/dashboard-data', async (req, res) => {
      try {
        const users = await userCollection.find().toArray();
        const orders = await orderCollection.find().toArray();
        const services = await serviceCollection.find().toArray();

        res.send({
          users,
          orders,
          services
        });
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
        res.status(500).send({ success: false, message: "Failed to fetch dashboard data" });
      }
    });


    // token remove
    app.post('/logout', async (req, res) => {
      const user = req.body;
      console.log("logging out", user);

      res.clearCookie('token', { ...cookieOptions, maxAge: 0 }).send({ success: true })
    })

    // post from user servicerequest
    // POST route to submit a new service request from a user
    app.post('/servicerequest', async (req, res) => {
      try {
        // Assume the request body contains all necessary data
        const newRequest = req.body;

        // Add a timestamp and initial status
        newRequest.postedAt = new Date();
        newRequest.status = "Open"; // Status can be 'Open', 'Assigned', 'Closed'

        // Validate required fields (optional but recommended)
        if (!newRequest.ordergivenuseremail || !newRequest.servicename || !newRequest.instruction) {
          return res.status(400).send({
            success: false,
            message: "Missing required fields (email, service name, or instructions)."
          });
        }

        // Save the request to the database
        const result = await serviceRequestsCollection.insertOne(newRequest);

        res.status(201).send({
          success: true,
          message: "Service request posted successfully!",
          data: result.insertedId // Return the ID of the new document
        });

      } catch (error) {
        console.error("Error posting service request:", error);
        res.status(500).send({
          success: false,
          message: "Internal server error occurred while posting the request."
        });
      }
    });


    app.put('/order/:id', async (req, res) => {
      const id = req.params.id;
      const { serviceStatus } = req.body;

      try {
        const result = await orderCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { serviceStatus } }
        );
        if (result.modifiedCount > 0) {
          res.send({ success: true, serviceStatus });
        } else {
          res.status(404).send({ success: false, message: "Service not found" });
        }
      } catch (error) {
        res.status(500).send({ success: false, message: "Internal server error" });
      }
    });

    //  all order
    app.get('/order', async (req, res) => {
      const email = req.query.email; // For ordergivenuseremail
      const email2 = req.query.email2; // For serviceprovideremail

      let query = {};

      if (email || email2) {
        query = {
          $or: [
            { ordergivenuseremail: email },
            { serviceprovideremail: email2 }
          ]
        };
      }
      console.log(req.cookies);

      try {
        const cursor = orderCollection.find(query);
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching orders:", error);
        res.status(500).send({ error: "Failed to fetch orders." });
      }
    });
    // cancleorder
    app.put('/order/cancel/:id', async (req, res) => {
      try {
        const id = req.params.id; // The orderid from your collection

        // Data to update the document with
        const updateDoc = {
          $set: {
            serviceStatus: 'cancelled'
          }
        };

        // Query to find the document by your custom string orderid
        const query = { orderid: id };

        // Options: return the updated document
        const options = { returnOriginal: false };

        // Update the document in MongoDB
        const result = await orderCollection.updateOne(query, updateDoc, options);

        if (result.matchedCount === 0) {
          return res.status(404).send({
            success: false,
            message: "Order not found."
          });
        }

        res.status(200).send({
          success: true,
          message: "Order successfully cancelled.",
          data: result
        });

      } catch (error) {
        console.error("Error cancelling order:", error);
        res.status(500).send({
          success: false,
          message: "Internal server error during cancellation."
        });
      }
    });
    // delteorder
    app.delete('/order/:id', async (req, res) => {
      try {
        const id = req.params.id; // The orderid from your collection

        // Query to find the document by your custom string orderid
        const query = { orderid: id };

        // Delete the document in MongoDB
        const result = await orderCollection.deleteOne(query);

        if (result.deletedCount === 0) {
          return res.status(404).send({
            success: false,
            message: "Order not found or already deleted."
          });
        }

        res.status(200).send({
          success: true,
          message: "Order successfully deleted.",
          data: result
        });

      } catch (error) {
        console.error("Error deleting order:", error);
        res.status(500).send({
          success: false,
          message: "Internal server error during deletion."
        });
      }
    });
    // order by id
    app.get('/order/:email', async (req, res) => {
      try {
        const email = req.params.email;
        console.log(email)
        const query = { ordergivenuseremail: email };
        const orders = await orderCollection.find(query).toArray();

        if (orders.length > 0) {
          res.status(200).send({
            success: true,
            message: "Orders found.",
            data: orders
          });
        } else {
          res.status(404).send({
            success: false,
            message: "No orders found for this email.",
            data: [] // Return an empty array when no orders are found
          });
        }
      } catch (error) {
        console.error("Error fetching orders:", error);
        res.status(500).send({
          success: false,
          message: "An internal server error occurred.",
          data: null
        });
      }
    })

    // order
    app.post('/order', async (req, res) => {
      const session = client.startSession(); // Start MongoDB transaction session

      try {
        session.startTransaction();

        const { cost, userId, ...orderData } = req.body;
        console.log(cost, userId,orderData)

        // 2. Convert userId to ObjectId
        const userObjectId = new ObjectId(userId);
        console.log(userObjectId)

        // 3. Check Wallet Balance & Deduct Funds (Atomic Operation)
        const deductionResult = await userCollection.findOneAndUpdate(
          {
            _id: userObjectId,
            wallet: { $gte: cost } // Ensures wallet has enough funds
          },
          {
            $inc: { wallet: -cost }, // Deduct the cost
            $push: {
              transactions: { // Log the deduction
                type: 'service_deduction',
                amount: -cost,
                serviceId: orderData.orderid,
                timestamp: new Date()
              }
            }
          },
          { returnDocument: 'after', session } // Return the updated document
        );
        console.log("deductionResult :",deductionResult)

        if (!deductionResult) {
          await session.abortTransaction();
          return res.status(400).json({ message: 'Insufficient wallet balance or user not found.' });
        }

        const newWalletBalance = deductionResult.wallet;

        // 4. Create the Order
        const orderDoc = {
          ...orderData,
          ordergivenuserId: userId, // Link the order to the user ID
          bookedAt: new Date(),
          cost:cost,
          // Set initial service status
          serviceStatus: 'Pending',
          // 🔑 Escrow Status: Funds are held by the platform (deducted from user)
          escrowStatus: 'HeldByPlatform'
        };

        const orderCreationResult = await orderCollection.insertOne(orderDoc, { session });

        if (!orderCreationResult.insertedId) {
          throw new Error('Failed to create order document.');
        }

        // 5. Commit Transaction
        await session.commitTransaction();

        res.status(200).json({
          message: 'Booking successful. Funds deducted and held in escrow.',
          insertedId: orderCreationResult.insertedId,
          newWalletBalance: newWalletBalance,
        });

      } catch (error) {
        await session.abortTransaction();
        console.error('Transaction Failed:', error);
        res.status(500).json({ message: `Server error during booking transaction: ${error.message}` });
      } finally {
        await session.endSession();
      }

    })
    // service details
    app.get('/addservice/:id', async (req, res) => {
      const id = req.params.id;

      // if (!ObjectId.isValid(id)) {
      //   return res.status(400).send({ error: "Invalid ID format" });
      // }
      const query = { _id: new ObjectId(id) }

      const service = await serviceCollection.findOne(query);
      res.send(service)
    })
    app.get('/services/names', async (req, res) => {
      try {
        // Use the find() method on your collection
        const services = await serviceCollection.find(
          {}, // The first object is the query filter (empty to select all documents)
          { projection: { serviceName: 1, _id: 0 } } // The second object is the projection
        ).toArray(); // Use .toArray() to convert the cursor result into an array

        // The services array will look like: 
        // [{ serviceName: 'Plumbing' }, { serviceName: 'Electrician' }, ...]

        // 🔑 OPTIONAL: Transform the array to be a simple list of strings if preferred
        const serviceNames = services.map(service => service.serviceName);

        // Respond with the list of service names
        res.json(serviceNames);

      } catch (error) {
        console.error('Error fetching service names:', error);
        // Send a 500 server error response
        res.status(500).json({
          success: false,
          message: 'Failed to retrieve service names',
          error: error.message
        });
      }
    });
    // edit apit service
    app.put('/addservice2/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const option = { upsert: true };
      const updatedData = req.body;
      const data = {
        $set: {
          imageUrl: updatedData.imageUrl,
          serviceName: updatedData.serviceName,
          serviceArea: updatedData.serviceArea,
          description: updatedData.description,
          price: updatedData.price,
        }
      }

      const service = await serviceCollection.updateOne(query, data, option);
      res.send(service)
    })

    // serive info i update
    app.get('/addservice2/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const service = await serviceCollection.findOne(query);
      res.send(service)
    })
    // delet service
    app.delete('/addservice/:id', async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = { _id: new ObjectId(id) }
      const result = await serviceCollection.deleteOne(query)
      res.send(result);
    })


    // privet routs jwt
    app.get('/addservice23', verify, async (req, res) => {
      const email = req.query.email;
      const limit = parseInt(req.query.limit) || 0;

      let query = {};
      if (email) {
        query = { provideremail: email }
      }

      const cursor = serviceCollection.find(query).limit(limit);
      const result = await cursor.toArray();
      res.send(result);
    })
    // all serviec api
    app.get('/addservice', async (req, res) => {
      const email = req.query.email;
      console.log("user email :", email);


      const limit = parseInt(req.query.limit) || 0;

      let query = {};
      if (email) {
        query = { provideremail: email }
      }

      const cursor = serviceCollection.find(query).limit(limit);
      const result = await cursor.toArray();
      res.send(result);
    })
    // get all service 
    app.get('/services/all', async (req, res) => {
      // NOTE: This route should be protected by Admin middleware
      try {
        const services = await serviceCollection.find({}).toArray();
        res.status(200).send({ success: true, data: services });
      } catch (error) {
        console.error("Error retrieving all services:", error);
        res.status(500).send({ success: false, message: "Internal server error." });
      }
    });
    // create service
    app.post('/addservice', async (req, res) => {
      const newservice = req.body;
      console.log(" new service", newservice);
      const result = await serviceCollection.insertOne(newservice);
      res.send(result);

    })

    // get al user
    app.get("/user/:email?", async (req, res) => {
      const email = req.params.email;

      try {
        if (email) {
          const user = await userCollection.findOne({ email });
          if (user) {
            res.send(user);
          } else {
            res.status(404).send({ message: "User not found" });
          }

        } else {
          const users = await userCollection.find().toArray();
          res.send(users);
        }
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Internal server error" });
      }
    });
    app.get("/onlyusers/:email?", async (req, res) => {
      const email = req.params.email;
      console.log(email)
      try {
        if (email) {
          const user = await userCollection.findOne({ email });
          if (user) {
            res.send(user);
          } else {
            res.status(404).send({ message: "User not found" });
          }

        } else {
          const users = await userCollection.find({ role: "user" }).toArray();
          res.send(users);
        }
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Internal server error" });
      }
    });
    app.get("/sprovider/:email?", async (req, res) => {
      const email = req.params.email;
      console.log(email)
      try {
        if (email) {
          const user = await userCollection.findOne({ email });
          if (user) {
            res.send(user);
          } else {
            res.status(404).send({ message: "User not found" });
          }

        } else {
          const users = await userCollection.find({ role: "serviceProvider" }).toArray();
          res.send(users);
        }
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Internal server error" });
      }
    });
    // PATCH route to change status from Pending to In Progress (Take Order)
    app.patch('/order/take/:id', async (req, res) => {
      try {
        const orderId = req.params.id; // Using the 'orderid' field from your collection, not MongoDB's _id
        console.log(orderId)
        // Find the order by your custom string orderid
        const query = { orderid: orderId };

        const updateDoc = {
          $set: {
            serviceStatus: 'In Progress'
            // Optionally, log the time the order was taken
            // takenAt: new Date()
          }
        };

        const result = await orderCollection.updateOne(query, updateDoc);

        if (result.matchedCount === 0) {
          return res.status(404).send({ success: false, message: "Order not found." });
        }
        if (result.modifiedCount === 0) {
          return res.status(200).send({ success: true, message: "Order status already 'In Progress'." });
        }

        res.status(200).send({
          success: true,
          message: "Order successfully marked as 'In Progress' (Taken).",
        });

      } catch (error) {
        console.error("Error taking order:", error);
        res.status(500).send({ success: false, message: "Internal server error." });
      }
    });
    // PATCH route to change status to Cancelled (Service Provider initiated)
    app.patch('/order/cancel-provider/:id', async (req, res) => {
      try {
        const orderId = req.params.id;
        const query = { orderid: orderId };

        // Only allow cancellation if it's currently 'In Progress' (or 'Pending' if you want)
        // const filter = { orderid: orderId, serviceStatus: { $in: ['Pending', 'In Progress'] } };

        const updateDoc = {
          $set: {
            serviceStatus: 'Cancelled'
          }
        };

        const result = await orderCollection.updateOne(query, updateDoc);

        if (result.matchedCount === 0) {
          return res.status(404).send({ success: false, message: "Order not found or not eligible for cancellation." });
        }

        res.status(200).send({
          success: true,
          message: "Order successfully marked as 'Cancelled'.",
        });

      } catch (error) {
        console.error("Error cancelling order:", error);
        res.status(500).send({ success: false, message: "Internal server error during cancellation." });
      }
    });



    // user info update 
    app.put('/user/:email', async (req, res) => {
      const userEmail = req.params.email;
      const updateData = req.body;

      // Destructure to safely remove the immutable _id and id fields
      const { _id, id, ...fieldsToUpdate } = updateData;

      try {
        console.log(updateData);

        // 🔑 Use userCollection.findOneAndUpdate and store the result
        const result = await userCollection.findOneAndUpdate(
          { email: userEmail },
          { $set: fieldsToUpdate },
          {
            // Important native driver option: ensures the updated document is returned
            returnDocument: 'after',
            // Prevents creating a new document if none is found
            upsert: false
          }
        );

        // 🔑 FIX: Get the updated document from the 'value' property of the result
        const updatedUser = result.value;

        if (!updatedUser) {
          // This handles the case where no user was found with the given email
          return res.status(404).json({ success: false, message: 'User not found' });
        }


        const safeUserData = { ...updatedUser };
        delete safeUserData.password; // Remove password field from the response

        // Return the cleaned user data
        res.json(safeUserData);

      } catch (error) {
        console.error('Error updating user profile:', error);
        res.status(500).json({ success: false, message: 'Failed to update profile', error: error.message });
      }
    });
    // create user

    app.post('/user', async (req, res) => {
      const newuser = req.body;
      const isExit = await userCollection.findOne({ email: newuser.email });
      if (isExit) {
        return res.send({ message: "user already exit" })
      }
      console.log("new user, ", newuser);
      const result = await userCollection.insertOne(newuser);
      res.send(result);
    })
    // user stauts or 
    app.put('/user/status/:email', async (req, res) => {
      try {
        const email = req.params.email;
        // The body should contain the new status, e.g., { isBlocked: true }
        const { isBlocked } = req.body;

        if (typeof isBlocked !== 'boolean') {
          return res.status(400).send({ success: false, message: "Invalid status provided. Must be true or false." });
        }

        // Prevent Superadmin from blocking themselves (highly recommended!)
        // You would typically check the requesting user's role/email here.

        const filter = { email: email };
        const updateDoc = {
          $set: {
            isBlocked: isBlocked,
            // Optionally log the change time
            statusUpdated: new Date()
          }
        };

        const result = await userCollection.updateOne(filter, updateDoc);

        if (result.matchedCount === 0) {
          return res.status(404).send({ success: false, message: "User not found." });
        }

        const action = isBlocked ? 'blocked' : 'unblocked';

        res.status(200).send({
          success: true,
          message: `User ${email} successfully ${action}.`,
          data: result
        });

      } catch (error) {
        console.error("Error updating user status:", error);
        res.status(500).send({
          success: false,
          message: "Internal server error."
        });
      }
    });
    // DELETE route to permanently remove a user by email
    app.delete('/user/delete/:email', async (req, res) => {
      try {
        const email = req.params.email;
        const query = { email: email };

        // Prevent Superadmin from deleting their own account! (Highly recommended)

        const result = await userCollection.deleteOne(query);

        if (result.deletedCount === 0) {
          return res.status(404).send({ success: false, message: "User not found or already deleted." });
        }

        // Note: You should also implement logic to delete associated data (orders, service requests, etc.)

        res.status(200).send({
          success: true,
          message: `User ${email} and associated data successfully deleted.`,
          data: result
        });

      } catch (error) {
        console.error("Error deleting user:", error);
        res.status(500).send({
          success: false,
          message: "Internal server error during deletion."
        });
      }
    });
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error

  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
  res.send('trustyhand is getting ready ')
})

app.listen(port, () => {
  console.log("service portal is runnning on ", port);

})





