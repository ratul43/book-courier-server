const express = require('express')
const app = express()
const cors = require("cors");
require("dotenv").config();

const stripe = require('stripe')(process.env.STRIPE_SECRET);

const port = 3000
app.use(cors())
app.use(express.json())

// DataBase Configuration 


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.sb5wtw8.mongodb.net/?appName=Cluster0`;



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
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    // build api for data collection
    const db = client.db("BookCourierDB")
    const booksCollection = db.collection("allBooks")
    const latestBooksCollection = db.collection("latestBooks")
    const ordersCollection = db.collection("allOrders")



    // Book Related Api 
    // get all books data
    app.get("/allBooks", async(req, res)=> {
      const books = await booksCollection.find().toArray()
      res.send(books)
    })

    app.post("/addBooks", async(req, res)=>{
      const bookData = req.body 
      const result = await booksCollection.insertOne(bookData)
      res.send(result)
    })

    // get a book information 
    app.get("/allBooks/:id", async(req, res)=>{
      const id = req.params.id
      const result = await booksCollection.findOne({_id: new ObjectId(id)})
      res.send(result)
    })

    // post the user order books
    app.post("/orders", async(req, res)=> {
      const orderData = req.body 
      const result = await ordersCollection.insertOne(orderData)
      res.send(result)
    })

    app.get("/orders", async(req, res)=> {
      const result = await ordersCollection.find().toArray()
      res.send(result)
    })

    // cancel orders api 
    app.patch("/orders/cancel/:id", async(req, res)=>{
      const id = req.params.id 
     
      const result = await ordersCollection.updateOne(
        {_id: new ObjectId(id)},
        {$set: {status: "cancelled"}}
      )
      res.send(result)
    })

    // payment related apis
    app.post('/create-checkout-session', async(req, res)=>{
      const paymentInfo = req.body 
      const amount = Number(paymentInfo.totalCost) * 100
      // console.log(paymentInfo);

      const session = await stripe.checkout.sessions.create({
    line_items: [
      {

        price_data:{
          currency: 'USD',
          unit_amount: amount,
          product_data: {
            name: paymentInfo.bookName
          }
        },
        
        quantity: 1,
      },
    ],
    customer_email: paymentInfo.customerEmail,
    mode: 'payment',
    metadata: {
      bookId: paymentInfo.bookId,
    },
    success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
  })

  // console.log(session)
  res.send({url: session.url })

    })


    app.patch("/payment-success", async(req, res)=>{
      const sessionId = req.query.session_id
      // console.log('session id', sessionId);

      const session = await stripe.checkout.sessions.retrieve(sessionId)

      // console.log('session retrieve', session);

      if(session.payment_status === 'paid'){
        const id = session.metadata.bookId
        
        const query = {_id: new ObjectId(id)}
        const update = 
        {$set: {
            paymentStatus: 'paid',
            status: 'paid'
          }
        }
        const result = await ordersCollection.updateOne(query, update)
        // console.log(result);
        res.send(result)
      }

    })


























    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);




app.get('/', (req, res) => {
  res.send('Hello from Server!')
})
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})