import express from "express";
import pg from "pg";

const { Pool } = pg;

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 10000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false
});

async function initializeDatabase() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS organizations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(100) UNIQUE NOT NULL,
      phone_number VARCHAR(50),
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id),
      license_plate VARCHAR(20) NOT NULL,
      state VARCHAR(50),
      make VARCHAR(100),
      model VARCHAR(100),
      color VARCHAR(50),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(organization_id, license_plate)
    );

    CREATE TABLE IF NOT EXISTS violations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id),
      vehicle_id UUID NOT NULL REFERENCES vehicles(id),
      violation_type VARCHAR(255) NOT NULL,
      description TEXT,
      amount_due NUMERIC(10,2) NOT NULL DEFAULT 0,
      status VARCHAR(50) NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS boots (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id),
      vehicle_id UUID NOT NULL REFERENCES vehicles(id),
      violation_id UUID REFERENCES violations(id),
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      location TEXT,
      booted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      removed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS removal_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id),
      vehicle_id UUID NOT NULL REFERENCES vehicles(id),
      boot_id UUID REFERENCES boots(id),
      status VARCHAR(50) NOT NULL DEFAULT 'requested',
      requested_by VARCHAR(50) NOT NULL DEFAULT 'phone_ai',
      payment_method VARCHAR(50) NOT NULL DEFAULT 'in_person',
      payment_status VARCHAR(50) NOT NULL DEFAULT 'unpaid',
      notes TEXT,
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS calls (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID REFERENCES organizations(id),
      caller_phone VARCHAR(50),
      license_plate VARCHAR(20),
      call_status VARCHAR(50) NOT NULL DEFAULT 'started',
      outcome VARCHAR(100),
      notes TEXT,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_vehicles_plate
      ON vehicles(license_plate);

    CREATE INDEX IF NOT EXISTS idx_boots_vehicle
      ON boots(vehicle_id);

    CREATE INDEX IF NOT EXISTS idx_removal_requests_vehicle
      ON removal_requests(vehicle_id);

    CREATE INDEX IF NOT EXISTS idx_calls_phone
      ON calls(caller_phone);
  `);

  console.log("BootBros database initialized successfully.");
}

app.get("/", (req, res) => {
  res.json({
    name: "BootBros AI",
    status: "online",
    version: "1.0.0"
  });
});

app.get("/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS time");

    res.json({
      ok: true,
      service: "bootbros-ai",
      database: "connected",
      databaseTime: result.rows[0].time
    });
  } catch (error) {
    console.error("Database connection failed:", error);

    res.status(500).json({
      ok: false,
      service: "bootbros-ai",
      database: "disconnected"
    });
  }
});

app.post("/setup/bootbros", async (req, res) => {
  try {
    const result = await pool.query(
      `
      INSERT INTO organizations (name, slug, phone_number)
      VALUES ($1, $2, $3)
      ON CONFLICT (slug)
      DO UPDATE SET
        name = EXCLUDED.name,
        phone_number = EXCLUDED.phone_number
      RETURNING id, name, slug, phone_number, active
      `,
      [
        "BootBros",
        "bootbros",
        null
      ]
    );

    res.json({
      success: true,
      organization: result.rows[0]
    });
  } catch (error) {
    console.error("BootBros setup failed:", error);

    res.status(500).json({
      success: false,
      error: "Could not create BootBros"
    });
  }
});

app.post("/setup/test-boot", async (req, res) => {
  try {
    const org = await pool.query(
      `SELECT id FROM organizations WHERE slug = 'bootbros'`
    );

    if (org.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "BootBros organization not found"
      });
    }

    const organizationId = org.rows[0].id;

    const vehicle = await pool.query(
      `
      INSERT INTO vehicles (
        organization_id,
        license_plate,
        state,
        make,
        model,
        color
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (organization_id, license_plate)
      DO UPDATE SET
        state = EXCLUDED.state,
        make = EXCLUDED.make,
        model = EXCLUDED.model,
        color = EXCLUDED.color
      RETURNING *
      `,
      [
        organizationId,
        "BOOT123",
        "TEST",
        "Toyota",
        "Camry",
        "Silver"
      ]
    );

    const vehicleId = vehicle.rows[0].id;

    const violation = await pool.query(
      `
      INSERT INTO violations (
        organization_id,
        vehicle_id,
        violation_type,
        description,
        amount_due,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
      `,
      [
        organizationId,
        vehicleId,
        "TEST_BOOT_VIOLATION",
        "Test BootBros violation",
        125.00,
        "open"
      ]
    );

    const violationId = violation.rows[0].id;

    const boot = await pool.query(
      `
      INSERT INTO boots (
        organization_id,
        vehicle_id,
        violation_id,
        status,
        location
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [
        organizationId,
        vehicleId,
        violationId,
        "active",
        "Test Parking Lot"
      ]
    );

    res.json({
      success: true,
      test_vehicle: vehicle.rows[0],
      violation: violation.rows[0],
      boot: boot.rows[0]
    });
  } catch (error) {
    console.error("Test boot creation failed:", error);

    res.status(500).json({
      success: false,
      error: "Could not create test boot"
    });
  }
});

async function startServer() {
  try {
    await initializeDatabase();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`BootBros AI running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Startup failed:", error);
    process.exit(1);
  }
}

startServer();
