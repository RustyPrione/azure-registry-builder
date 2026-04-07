const express = require("express");
const cors = require("cors");
const path = require("path")
const gitRoutes = require("./routes/gitRoutes");
const azureRoutes = require("./routes/azureRoutes");
const buildRoutes = require("./routes/buildRoutes");

const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./swagger");

process.env.PYTHONIOENCODING = "utf-8";
process.env.LANG = "en_US.UTF-8";
if (process.platform === "win32") {
  process.env.PYTHONUTF8 = "1";
  process.env.AZURE_CORE_NO_COLOR = process.env.AZURE_CORE_NO_COLOR || "true";
  process.env.NO_COLOR = process.env.NO_COLOR || "1";
}

const app = express();

app.use(cors({
  origin: "*"
}))

app.use(express.json());

app.use("/api/git", gitRoutes);
app.use("/api/azure", azureRoutes);
app.use("/api/build", buildRoutes);

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/* Frontend */
app.use(express.static(path.join(__dirname,"public")))

app.get("/",(req,res)=>{
  res.sendFile(path.join(__dirname,"public","index.html"))
})

const PORT = 3000;

app.listen(PORT, () => {
  console.log("Cros Origin Code deployed v1.")
  console.log(`Server running on port ${PORT}`);
});