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

    CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  email VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'viewer',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,

  UNIQUE(organization_id, email),

  CHECK (
    role IN (
      'organization_admin',
      'dispatcher',
      'technician',
      'viewer'
    )
  )
);

CREATE TABLE IF NOT EXISTS technicians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id),
  technician_number VARCHAR(50),
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

    CREATE INDEX IF NOT EXISTS idx_users_organization
  ON users(organization_id);

CREATE INDEX IF NOT EXISTS idx_users_email
  ON users(email);

CREATE INDEX IF NOT EXISTS idx_technicians_user
  ON technicians(user_id);

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

app.get("/api/vehicles/:plate", async (req, res) => {
  try {
    const plate = req.params.plate.trim().toUpperCase();

    const result = await pool.query(
      `
      SELECT
        v.id AS vehicle_id,
        v.license_plate,
        v.state,
        v.make,
        v.model,
        v.color,

        o.id AS organization_id,
        o.name AS organization_name,

        b.id AS boot_id,
        b.status AS boot_status,
        b.location AS boot_location,
        b.booted_at,

        vi.id AS violation_id,
        vi.violation_type,
        vi.description AS violation_description,
        vi.amount_due,
        vi.status AS violation_status

      FROM vehicles v

      JOIN organizations o
        ON o.id = v.organization_id

      LEFT JOIN boots b
        ON b.vehicle_id = v.id
        AND b.status = 'active'

      LEFT JOIN violations vi
        ON vi.id = b.violation_id

      WHERE v.license_plate = $1
      LIMIT 1
      `,
      [plate]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        found: false,
        message: "No vehicle found for that license plate."
      });
    }

    const vehicle = result.rows[0];

    res.json({
      found: true,
      vehicle: {
        id: vehicle.vehicle_id,
        license_plate: vehicle.license_plate,
        state: vehicle.state,
        make: vehicle.make,
        model: vehicle.model,
        color: vehicle.color
      },
      organization: {
        id: vehicle.organization_id,
        name: vehicle.organization_name
      },
      boot: vehicle.boot_id
        ? {
            id: vehicle.boot_id,
            status: vehicle.boot_status,
            location: vehicle.boot_location,
            booted_at: vehicle.booted_at
          }
        : null,
      violation: vehicle.violation_id
        ? {
            id: vehicle.violation_id,
            type: vehicle.violation_type,
            description: vehicle.violation_description,
            amount_due: vehicle.amount_due,
            status: vehicle.violation_status
          }
        : null
    });
  } catch (error) {
    console.error("Vehicle lookup failed:", error);

    res.status(500).json({
      found: false,
      error: "Vehicle lookup failed"
    });
  }
});

app.post("/api/removal-requests", async (req, res) => {
  try {
    const { license_plate, notes } = req.body;

    if (!license_plate) {
      return res.status(400).json({
        success: false,
        error: "license_plate is required"
      });
    }

    const plate = license_plate.trim().toUpperCase();

    const vehicleResult = await pool.query(
      `
      SELECT
        v.id AS vehicle_id,
        v.organization_id,
        b.id AS boot_id,
        b.status AS boot_status
      FROM vehicles v
      LEFT JOIN boots b
        ON b.vehicle_id = v.id
        AND b.status = 'active'
      WHERE v.license_plate = $1
      LIMIT 1
      `,
      [plate]
    );

    if (vehicleResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Vehicle not found"
      });
    }

    const vehicle = vehicleResult.rows[0];

    if (!vehicle.boot_id || vehicle.boot_status !== "active") {
      return res.status(409).json({
        success: false,
        error: "No active boot found for this vehicle"
      });
    }

    const existingRequest = await pool.query(
      `
      SELECT *
      FROM removal_requests
      WHERE vehicle_id = $1
        AND status IN ('requested', 'assigned', 'en_route', 'in_progress')
      ORDER BY requested_at DESC
      LIMIT 1
      `,
      [vehicle.vehicle_id]
    );

    if (existingRequest.rows.length > 0) {
      return res.json({
        success: true,
        existing: true,
        removal_request: existingRequest.rows[0]
      });
    }

    const result = await pool.query(
      `
      INSERT INTO removal_requests (
        organization_id,
        vehicle_id,
        boot_id,
        status,
        requested_by,
        payment_method,
        payment_status,
        notes
      )
      VALUES ($1, $2, $3, 'requested', 'phone_ai', 'in_person', 'unpaid', $4)
      RETURNING *
      `,
      [
        vehicle.organization_id,
        vehicle.vehicle_id,
        vehicle.boot_id,
        notes || null
      ]
    );

    res.status(201).json({
      success: true,
      existing: false,
      removal_request: result.rows[0]
    });

  } catch (error) {
    console.error("Removal request failed:", error);

    res.status(500).json({
      success: false,
      error: "Could not create removal request"
    });
  }
});

app.patch("/api/removal-requests/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, payment_status } = req.body;

    const allowedStatuses = [
      "requested",
      "assigned",
      "en_route",
      "in_progress",
      "completed",
      "cancelled"
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Invalid removal request status"
      });
    }

    const requestResult = await pool.query(
      `
      SELECT *
      FROM removal_requests
      WHERE id = $1
      LIMIT 1
      `,
      [id]
    );

    if (requestResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Removal request not found"
      });
    }

    const request = requestResult.rows[0];

    let finalPaymentStatus = request.payment_status;

    if (payment_status) {
      if (!["unpaid", "paid"].includes(payment_status)) {
        return res.status(400).json({
          success: false,
          error: "Invalid payment status"
        });
      }

      finalPaymentStatus = payment_status;
    }

    const completedAt =
      status === "completed"
        ? new Date()
        : request.completed_at;

    const result = await pool.query(
      `
      UPDATE removal_requests
      SET
        status = $1,
        payment_status = $2,
        completed_at = $3
      WHERE id = $4
      RETURNING *
      `,
      [
        status,
        finalPaymentStatus,
        completedAt,
        id
      ]
    );

    if (status === "completed") {
      await pool.query(
        `
        UPDATE boots
        SET
          status = 'removed',
          removed_at = NOW()
        WHERE id = $1
        `,
        [request.boot_id]
      );
    }

    res.json({
      success: true,
      removal_request: result.rows[0]
    });

  } catch (error) {
    console.error("Removal status update failed:", error);

    res.status(500).json({
      success: false,
      error: "Could not update removal request"
    });
  }
});

app.get("/api/removal-status/:plate", async (req, res) => {
  try {
    const plate = req.params.plate.trim().toUpperCase();

    const result = await pool.query(
      `
      SELECT
        rr.id AS removal_request_id,
        rr.status AS removal_status,
        rr.payment_method,
        rr.payment_status,
        rr.requested_at,
        rr.completed_at,

        v.license_plate,
        v.make,
        v.model,
        v.color,

        b.status AS boot_status,
        b.location AS boot_location,

        o.name AS organization_name

      FROM removal_requests rr

      JOIN vehicles v
        ON v.id = rr.vehicle_id

      JOIN organizations o
        ON o.id = rr.organization_id

      LEFT JOIN boots b
        ON b.id = rr.boot_id

      WHERE v.license_plate = $1

      ORDER BY rr.requested_at DESC

      LIMIT 1
      `,
      [plate]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        found: false,
        message: "No removal request found for that license plate."
      });
    }

    const record = result.rows[0];

    res.json({
      found: true,

      vehicle: {
        license_plate: record.license_plate,
        make: record.make,
        model: record.model,
        color: record.color
      },

      removal: {
        id: record.removal_request_id,
        status: record.removal_status,
        requested_at: record.requested_at,
        completed_at: record.completed_at
      },

      payment: {
        method: record.payment_method,
        status: record.payment_status
      },

      boot: {
        status: record.boot_status,
        location: record.boot_location
      },

      organization: record.organization_name
    });

  } catch (error) {
    console.error("Removal status lookup failed:", error);

    res.status(500).json({
      found: false,
      error: "Could not retrieve removal status"
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
