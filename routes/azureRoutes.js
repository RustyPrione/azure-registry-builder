const express = require("express");
const router = express.Router();
const { getRegistries, getRepositories } = require("../utils/azureService");

/**
 * @swagger
 * /api/azure/registries:
 *   get:
 *     summary: Get Azure Container Registries
 *     tags:
 *       - Azure
 *     responses:
 *       200:
 *         description: List of ACR registries
 */
router.get("/registries", async (req, res) => {

  try {
    
    const registries = await getRegistries();

    res.json({
      success: true,
      registries
    });

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }

});

/**
 * @swagger
 * /api/azure/repositories:
 *   post:
 *     summary: Get repositories from Azure Container Registry
 *     tags:
 *       - Azure
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               registryName:
 *                 type: string
 *                 example: myregistry
 */
router.post("/repositories", async (req, res) => {

  try {

    const { registryName } = req.body;

    if (!registryName) {
      return res.status(400).json({
        error: "registryName is required"
      });
    }

    const repos = await getRepositories(registryName);

    res.json({
      success: true,
      repositories: repos
    });

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }

});

module.exports = router;