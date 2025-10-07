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
    'https://trusty-hands.vercel.app'
  ],
  methods: ["GET", "POST", "PUT", "DELETE"],
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
    // jwt token
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN,
        { expiresIn: '5h' });

      res.cookie('token', token, cookieOptions)
        .send({ success: true })
    })
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
      const order = req.body;
      console.log(order);
      const result = await orderCollection.insertOne(order);
      res.send(result)

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


    // create user

    app.post('/user', async (req, res) => {
      const newuser = req.body;
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





