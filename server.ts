import { Client } from "pg";
import { config } from "dotenv";
import express from "express";
import cors from "cors";

config(); //Read .env file lines as though they were env vars.

//Call this script with the environment variable LOCAL set if you want to connect to a local db (i.e. without SSL)
//Do not set the environment variable LOCAL if you want to connect to a heroku DB.

//For the ssl property of the DB connection config, use a value of...
// false - when connecting to a local DB
// { rejectUnauthorized: false } - when connecting to a heroku DB

const herokuSSLSetting = { rejectUnauthorized: false };
const sslSetting = process.env.LOCAL ? false : herokuSSLSetting;
const dbConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: sslSetting,
};

const app = express();

app.use(express.json()); //add body parser to each following route handler
app.use(cors()); //add CORS support to each following route handler

const client = new Client(dbConfig);
client.connect();

//GET requests
app.get("/workouts", async (req, res) => {
  try {
    const dbres = await client.query(
      "SELECT w.workout_id, title, day, duration_mins, notes, date, SUM(weight*reps) AS weight_lifted, COUNT(DISTINCT name) as exercises FROM workouts w JOIN sets s ON w.workout_id = s.workout_id GROUP BY w.workout_id ORDER BY date DESC"
    );
    res.status(200).json({ status: "success", data: dbres.rows });
  } catch (err) {
    res.status(404).json({ status: "failed", error: err });
  }
});

app.get("/sets", async (req, res) => {
  try {
    const dbres = await client.query("select * from sets");
    res.status(200).json({ status: "success", data: dbres.rows });
  } catch (err) {
    res.status(404).json({ status: "failed", error: err });
  }
});

app.get("/sets/best", async (req, res) => {
  try {
    const dbres = await client.query(
      "select workout_id, name, MAX(weight) as weight, MAX(reps) as reps from sets group by workout_id, name order by workout_id asc"
    );
    res.status(200).json({ status: "success", data: dbres.rows });
  } catch (err) {
    res.status(404).json({ status: "failed", error: err });
  }
});

//POST requests
app.post("/workout", async (req, res) => {
  const { title, day, duration_mins, notes, date } = req.body;
  try {
    const dbres = await client.query(
      `insert into workouts (
        title,
        day,
        duration_mins,
        notes, date) values($1, $2, $3, $4, $5) returning *`,
      [title, day, duration_mins, notes, date]
    );
    res.status(201).json({
      status: "success",
      data: dbres.rows[0],
    });
  } catch (err) {
    res.status(400).json({ status: "failed", error: err });
  }
});

// Add one set to a workout
app.post("/:workout_id/set", async (req, res) => {
  const { name, weight, reps } = req.body;
  try {
    const dbres = await client.query(
      `insert into sets ( workout_id, 
        name,
        weight,
        reps) values($1, $2, $3, $4) returning *`,
      [req.params.workout_id, name, weight, reps]
    );
    res.status(201).json({
      status: "success",
      data: dbres.rows[0],
    });
  } catch (err) {
    res.status(400).json({ status: "failed", error: err });
  }
});

interface SetType {
  name: string;
  weight: number;
  reps: number;
}

// Add multiple sets to a workout
app.post("/:workout_id/sets", async (req, res) => {
  const { data } = req.body;
  const setsArray: SetType[] = data;
  try {
    // Format the string to be put in our query
    let valuesString = "";
    setsArray.forEach((set) => {
      valuesString += `(${req.params.workout_id}, '${set.name}', ${set.weight}, ${set.reps}), `;
    });
    // Remove the final comma from the string
    const formattedValuesString = valuesString.slice(0, -2);
    const query = `insert into sets (workout_id, 
      name,
      weight,
      reps) values ${formattedValuesString} returning *`;
    console.log(query);
    const dbres = await client.query(`$1`, [query]);
    res.status(201).json({
      status: "success",
      data: dbres.rows[0],
    });
  } catch (err) {
    res.status(400).json({ status: "failed", error: err });
  }
});

//Start the server on the given port
const port = process.env.PORT;
if (!port) {
  throw "Missing PORT environment variable.  Set it in .env file.";
}
app.listen(port, () => {
  console.log(`Server is up and running on port ${port}`);
});
