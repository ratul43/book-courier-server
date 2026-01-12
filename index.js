const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();

const stripe = require("stripe")(process.env.STRIPE_SECRET);

const port = 3000;
const crypto = require("crypto");

function generateTrackingId() {
  const prefix = "PRCL"; // your brand prefix
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
  const random = crypto.randomBytes(3).toString("hex").toUpperCase(); // 6-char random hex

  return `${prefix}-${date}-${random}`;
}

app.use(cors());
app.use(express.json());

// DataBase Configuration

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.sb5wtw8.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    // build api for data collection
    const db = client.db("BookCourierDB");
    const booksCollection = db.collection("allBooks");
    const latestBooksCollection = db.collection("latestBooks");
    const ordersCollection = db.collection("allOrders");
    const paymentCollection = db.collection("payments");
    const usersCollection = db.collection("users");

    // Book Related Api
    // get all books data
    app.get("/allBooks", async (req, res) => {
      const books = await booksCollection.find().toArray();
      res.send(books);
    });

    app.post("/addBooks", async (req, res) => {
      const bookData = req.body;
      const result = await booksCollection.insertOne(bookData);
      res.send(result);
    });

    // get a book information
    app.get("/allBooks/:id", async (req, res) => {
      const id = req.params.id;
      const result = await booksCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // update the book status published or unpublished
    app.patch("/books/publish/:id", async (req, res) => {
      const { id } = req.params;
      const { publishStatus } = req.body;

      const result = await booksCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { publishStatus } }
      );

      res.send(result);
    });

    // post the user order books
    app.post("/orders", async (req, res) => {
      const orderData = req.body;
      const result = await ordersCollection.insertOne(orderData);
      res.send(result);
    });

    app.get("/orders", async (req, res) => {
      const result = await ordersCollection.find().toArray();
      res.send(result);
    });

    // user cancel orders api
    app.patch("/orders/cancel/:id", async (req, res) => {
      const id = req.params.id;

      const result = await ordersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "cancelled" } }
      );
      res.send(result);
    });

    // librarian status update related api
    app.patch("/orders/:id", async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;

      const result = await ordersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status } }
      );

      res.send(result);
    });

    // librarian order cancel api
    app.patch("/orders/librarian/:id", async (req, res) => {
      const { id } = req.params;

      const result = await ordersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "cancelled" } }
      );

      res.send(result);
    });

    // payment related apis
    app.post("/create-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const amount = Number(paymentInfo.totalCost) * 100;
      // console.log(paymentInfo);

      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "USD",
              unit_amount: amount,
              product_data: {
                name: paymentInfo.bookName,
              },
            },

            quantity: 1,
          },
        ],
        customer_email: paymentInfo.customerEmail,
        mode: "payment",
        metadata: {
          bookId: paymentInfo.bookId,
          bookName: paymentInfo.bookName,
        },
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
      });

      // console.log(session)
      res.send({ url: session.url });
    });

    app.patch("/payment-success", async (req, res) => {
      const sessionId = req.query.session_id;
      // console.log('session id', sessionId);

      const session = await stripe.checkout.sessions.retrieve(sessionId);

      // console.log('session retrieve', session);

      const transactionId = session.payment_intent;
      const query = { transactionId: transactionId };

      const paymentExist = await paymentCollection.findOne(query);

      if (paymentExist) {
        return res.send({
          message: "already exists",
          transactionId,
          trackingId: paymentExist.trackingId,
        });
      }

      const trackingId = generateTrackingId();
      if (session.payment_status === "paid") {
        const id = session.metadata.bookId;

        const query = { _id: new ObjectId(id) };
        const update = {
          $set: {
            paymentStatus: "paid",
            status: "paid",
            trackingId: trackingId,
          },
        };
        const result = await ordersCollection.updateOne(query, update);
        // console.log(result);

        const paymentTrackData = {
          amount: session.amount_total / 100,
          currency: session.currency,
          customerEmail: session.customer_email,
          parcelId: session.metadata.bookId,
          parcelName: session.metadata.bookName,
          transactionId: session.payment_intent,
          paymentStatus: session.payment_status,
          paidAt: new Date(),
          trackingId: trackingId,
        };

        if (session.payment_status === "paid") {
          const resultPayment = await paymentCollection.insertOne(
            paymentTrackData
          );
          res.send({
            success: true,
            modifyParcel: result,
            transactionId: session.payment_intent,
            trackingId: trackingId,
            paymentInfo: resultPayment,
          });
        }
      }
    });

    // get all payment information
    app.get("/payments", async (req, res) => {
      const result = await paymentCollection.find().toArray();
      res.send(result);
    });

    // librarian book add
    app.post("/librarian/bookAdd", async (req, res) => {
      const bookData = req.body;
      const result = await booksCollection.insertOne(bookData);
      res.send(result);
    });

    // librarian book update
    app.patch("/librarian/bookUpdate/:id", async (req, res) => {
      const id = req.params.id;
      const bookUpdateData = req.body;
      const result = await booksCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: bookUpdateData }
      );
      res.send(result);
    });

    // get all users data
    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    // user store related api
    app.post("/users", async (req, res) => {
      const userData = req.body;
      const result = await usersCollection.insertOne(userData);
      res.send(result);
    });

    // user update related api
    app.patch("/users", async (req, res) => {
      const userData = req.body;
      const email = req.query.email;
      const result = await usersCollection.updateOne(
        { email: email },
        { $set: userData }
      );
      res.send(result);
    });

    // admin make librarian api
    app.patch("/users/make-librarian", async (req, res) => {
      const email = req.query.email;
      const result = await usersCollection.updateOne(
        { email: email },
        { $set: { role: "librarian" } }
      );
      res.send(result);
    });

    // admin make admin api
    app.patch("/users/make-admin", async (req, res) => {
      const email = req.query.email;
      const result = await usersCollection.updateOne(
        { email: email },
        { $set: { role: "admin" } }
      );
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello from Server!");
});
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
