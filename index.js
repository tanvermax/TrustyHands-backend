const express = require('express');
const cors = require('cors');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// middleware
app.use(cors());
app.use(express.json());
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

    // Connect the client to the server	(optional starting in v4.7)
    //  all order
    app.get('/order', async (req, res) => {

      const cursor = orderCollection.find();
      const result = await cursor.toArray();
      res.send(result);
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
      const query = { _id: new ObjectId(id) }
      const service = await serviceCollection.findOne(query);
      res.send(service)
    })
    // serive info iupdate
    app.get('/addservice2/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const service = await serviceCollection.findOne(query);
      res.send(service)
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