const express = require('express');
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const  cookieParser = require('cookie-parser');
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// middleware
app.use(cors());
app.use(express.json());
app.use(cookieParser());
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

    const userCollection = client.db('service').collection("user")
    const serviceCollection = client.db('service').collection("allservice")
    const orderCollection = client.db('service').collection("order")
    // jwt token
    app.post('/jwt', async (req , res)=>{
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN,
        { expireIn: "5h" },
      res.cookie( "token",token,{
        httpOnly : true,
        secure : false,
      })
    .send({success :true}))
    })

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
    
      try {
        const cursor = orderCollection.find(query);
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching orders:", error);
        res.status(500).send({ error: "Failed to fetch orders." });
      }
    });

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

    // all serviec api
    app.get('/addservice', async (req, res) => {
      const email = req.query.email;
      let query = {};
      if (email) {
        query = { provideremail: email }
      }
      const cursor = serviceCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    })
    // create service
    app.post('/addservice', async (req, res) => {
      const newservice = req.body;
      console.log(" new service", newservice);
      const result = await serviceCollection.insertOne(newservice);
      res.send(result);

    })

    // get al user
    app.get('/user', async (req, res) => {
     
      const cursor = userCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    })
    // create user

    app.post('/user', async (req, res) => {
      const newuser = req.body;
      console.log("new user, ", newuser);
      const result = await userCollection.insertOne(newuser);
      res.send(result);
    })
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error

  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
  res.send('service is getting ready ')
})

app.listen(port, () => {
  console.log("service portal is runnning on ", port);

})





