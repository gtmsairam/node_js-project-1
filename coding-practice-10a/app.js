const express = require("express");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const path = require("path");
const jwttoken = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

function convertStateDbObjectToResponseObject(object) {
  return {
    stateId: object.state_id,
    stateName: object.state_name,
    population: object.population,
  };
}

const convertDistrictDbObjectToResponseObject = (object) => ({
  districtId: object.district_id,
  districtName: object.district_name,
  stateId: object.state_id,
  cases: object.cases,
  cured: object.cured,
  active: object.active,
  deaths: object.deaths,
});

//check user authentication
const authentication = (request, response, next) => {
  let jwt;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwt = authHeader.split(" ")[1];
  }
  if (jwt === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwttoken.verify(jwt, "SECRET_KEY", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

// login User
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  console.log(username);
  try {
    const dbQuery = `
     SELECT * FROM user WHERE username = '${username}';
  `;
    const dbUser = await db.get(dbQuery);

    if (dbUser === undefined) {
      response.status(400);
      response.send("Invalid user");
    } else {
      const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
      if (!isPasswordMatched) {
        response.status(400);
        response.send("Invalid password");
      } else {
        const payload = {
          username: username,
        };
        const jwtToken = jwttoken.sign(payload, "SECRET_KEY");
        response.send({ jwtToken });
      }
    }
  } catch (e) {
    console.log(`DB Error: ${e.message} `);
  }
});

// get all states
app.get("/states/", authentication, async (request, response) => {
  const dbQuery = `
     SELECT * FROM state
    `;
  const resArray = await db.all(dbQuery);
  response.send(
    resArray.map((eachState) => convertStateDbObjectToResponseObject(eachState))
  );
});

// get specified state
app.get("/states/:stateId/", authentication, async (request, response) => {
  const { stateId } = request.params;
  const dbQuery = `
    SELECT * FROM state WHERE state_id = '${stateId}'
   `;
  const requiredState = await db.get(dbQuery);
  response.send(convertStateDbObjectToResponseObject(requiredState));
});

// add a district
app.post("/districts/", authentication, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  try {
    const dbQuery = `
     INSERT INTO 
      district (district_name, state_id, cases, cured, active, deaths)
      VALUES
      ('${districtName}', ${stateId}, ${cases}, ${cured}, ${active}, ${deaths})
    `;
    await db.run(dbQuery);
    response.send("District Successfully Added");
  } catch (e) {
    console.log(`DB ERROR: ${e.message}`);
  }
});

// get specific district
app.get(
  "/districts/:districtId/",
  authentication,
  async (request, response) => {
    const { districtId } = request.params;
    const dbQuery = `
     SELECT * FROM district WHERE district_id = '${districtId}'
    `;
    const requiredDis = await db.get(dbQuery);
    response.send(convertDistrictDbObjectToResponseObject(requiredDis));
  }
);

// remove a specific district
app.delete(
  "/districts/:districtId/",
  authentication,
  async (request, response) => {
    const { districtId } = request.params;
    const dbQuery = `
     DELETE FROM district WHERE district_id = ${districtId}
    `;
    await db.run(dbQuery);
    response.send("District Removed");
  }
);

// update a district
app.put(
  "/districts/:districtId/",
  authentication,
  async (request, response) => {
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const dbQuery = `
    UPDATE district 
    SET district_name = '${districtName}',
        state_id = ${stateId},
        cases = ${cases},
        cured = ${cured},
        active = ${active},
        deaths = ${deaths}
    WHERE
        district_id = ${districtId}    
   `;
    await db.run(dbQuery);
    response.send("District Details Updated");
  }
);

app.get(
  "/states/:stateId/stats/",
  authentication,
  async (request, response) => {
    const { stateId } = request.params;
    const dbQuery = `
    SELECT 
     SUM(cases) as totalCases,
     SUM(cured) as totalCured,
     SUM(active) as totalActive,
     Sum(deaths) as totalDeaths
    FROM district where state_id = '${stateId}'
    `;
    const stateArray = await db.get(dbQuery);
    response.send(stateArray);
  }
);

module.exports = app;
