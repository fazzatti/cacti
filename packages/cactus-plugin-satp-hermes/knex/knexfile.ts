// import path from "path";
// import { v4 as uuidv4 } from "uuid";
const path = require("path");
const { v4: uuidv4 } = require("uuid");

// default configuration for knex
module.exports = {
  development: {
    client: "sqlite3",
    connection: {
      filename: path.resolve(__dirname, ".dev-" + uuidv4() + ".sqlite3"),
    },
    migrations: {
      directory: path.resolve(__dirname, "migrations"),
    },
    useNullAsDefault: true,
  },
};
