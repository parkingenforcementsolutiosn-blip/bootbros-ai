import express from "express";
import pg from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const { Pool } = pg;

const app = express();

app.use(express.json());
app.use(express.static("public"));

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

      ALTER TABLE boots
  ADD COLUMN IF NOT EXISTS technician_id UUID
    REFERENCES technicians(id);

ALTER TABLE boots
  ADD COLUMN IF NOT EXISTS boot_device_id VARCHAR(100);

ALTER TABLE boots
  ADD COLUMN IF NOT EXISTS boot_type VARCHAR(100);

ALTER TABLE boots
  ADD COLUMN IF NOT EXISTS wheel_position VARCHAR(50);

ALTER TABLE boots
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,7);

ALTER TABLE boots
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7);

  CREATE TABLE IF NOT EXISTS boot_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  code VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(organization_id, code)
);

CREATE TABLE IF NOT EXISTS boot_citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boot_id UUID NOT NULL REFERENCES boots(id) ON DELETE CASCADE,
  violation_id UUID REFERENCES violations(id),
  citation_number VARCHAR(100),
  amount_due NUMERIC(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_boot_reasons_org
  ON boot_reasons(organization_id);

CREATE INDEX IF NOT EXISTS idx_boot_citations_boot
  ON boot_citations(boot_id);

CREATE INDEX IF NOT EXISTS idx_boot_evidence_boot
  ON boot_evidence(boot_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org
  ON audit_logs(organization_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
  ON audit_logs(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS boot_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boot_id UUID NOT NULL REFERENCES boots(id) ON DELETE CASCADE,
  evidence_type VARCHAR(100) NOT NULL,
  file_url TEXT,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID REFERENCES users(id),
  technician_id UUID REFERENCES technicians(id),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

      CREATE TABLE IF NOT EXISTS boot_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  code VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(organization_id, code)
);

CREATE TABLE IF NOT EXISTS boot_citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boot_id UUID NOT NULL REFERENCES boots(id) ON DELETE CASCADE,
  violation_id UUID REFERENCES violations(id),
  citation_number VARCHAR(100),
  amount_due NUMERIC(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS boot_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boot_id UUID NOT NULL REFERENCES boots(id) ON DELETE CASCADE,
  evidence_type VARCHAR(100) NOT NULL,
  file_url TEXT,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID REFERENCES users(id),
  technician_id UUID REFERENCES technicians(id),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_boot_reasons_org
  ON boot_reasons(organization_id);

CREATE INDEX IF NOT EXISTS idx_boot_citations_boot
  ON boot_citations(boot_id);

CREATE INDEX IF NOT EXISTS idx_boot_evidence_boot
  ON boot_evidence(boot_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org
  ON audit_logs(organization_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
  ON audit_logs(entity_type, entity_id);
  
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

app.post("/setup/admin", async (req, res) => {
  try {
    const setupSecret = req.headers["x-bootbros-setup-secret"];

    if (!setupSecret || setupSecret !== process.env.BOOTBROS_SETUP_SECRET) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized"
      });
    }

    const {
      email,
      password,
      first_name,
      last_name
    } = req.body;

    if (!email || !password || !first_name || !last_name) {
      return res.status(400).json({
        success: false,
        error: "email, password, first_name and last_name are required"
      });
    }

    if (password.length < 12) {
      return res.status(400).json({
        success: false,
        error: "Password must be at least 12 characters"
      });
    }

    const organizationResult = await pool.query(
      `
      SELECT id, name
      FROM organizations
      WHERE slug = 'bootbros'
      LIMIT 1
      `
    );

    if (organizationResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "BootBros organization not found"
      });
    }

    const organization = organizationResult.rows[0];

    const existingAdmin = await pool.query(
      `
      SELECT id, email
      FROM users
      WHERE organization_id = $1
        AND role = 'organization_admin'
      LIMIT 1
      `,
      [organization.id]
    );

    if (existingAdmin.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: "BootBros administrator already exists"
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `
      INSERT INTO users (
        organization_id,
        email,
        password_hash,
        first_name,
        last_name,
        role
      )
      VALUES ($1, $2, $3, $4, $5, 'organization_admin')
      RETURNING
        id,
        organization_id,
        email,
        first_name,
        last_name,
        role,
        active,
        created_at
      `,
      [
        organization.id,
        email.trim().toLowerCase(),
        passwordHash,
        first_name.trim(),
        last_name.trim()
      ]
    );

    res.status(201).json({
      success: true,
      user: result.rows[0]
    });

  } catch (error) {
    console.error("Admin setup failed:", error);

    res.status(500).json({
      success: false,
      error: "Could not create administrator"
    });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Email and password are required"
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is not configured");

      return res.status(500).json({
        success: false,
        error: "Authentication is not configured"
      });
    }

    const result = await pool.query(
      `
      SELECT
        u.id,
        u.organization_id,
        u.email,
        u.password_hash,
        u.first_name,
        u.last_name,
        u.role,
        u.active,

        o.name AS organization_name,
        o.slug AS organization_slug

      FROM users u

      JOIN organizations o
        ON o.id = u.organization_id

      WHERE LOWER(u.email) = LOWER($1)
      LIMIT 1
      `,
      [email.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: "Invalid email or password"
      });
    }

    const user = result.rows[0];

    if (!user.active) {
      return res.status(403).json({
        success: false,
        error: "Account is inactive"
      });
    }

    const passwordValid = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordValid) {
      return res.status(401).json({
        success: false,
        error: "Invalid email or password"
      });
    }

    await pool.query(
      `
      UPDATE users
      SET last_login_at = NOW()
      WHERE id = $1
      `,
      [user.id]
    );

    const token = jwt.sign(
      {
        userId: user.id,
        organizationId: user.organization_id,
        role: user.role
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "8h"
      }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role
      },
      organization: {
        id: user.organization_id,
        name: user.organization_name,
        slug: user.organization_slug
      }
    });

  } catch (error) {
    console.error("Login failed:", error);

    res.status(500).json({
      success: false,
      error: "Login failed"
    });
  }
});

app.post("/setup/boot-reason", async (req, res) => {
  try {
    const setupSecret = req.headers["x-bootbros-setup-secret"];

    if (
      !process.env.BOOTBROS_SETUP_SECRET ||
      setupSecret !== process.env.BOOTBROS_SETUP_SECRET
    ) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized"
      });
    }

    const { code, name, description } = req.body;

    if (!code || !name) {
      return res.status(400).json({
        success: false,
        error: "code and name are required"
      });
    }

    const organizationResult = await pool.query(
      `
      SELECT id
      FROM organizations
      WHERE slug = 'bootbros'
      LIMIT 1
      `
    );

    if (organizationResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "BootBros organization not found"
      });
    }

    const organizationId = organizationResult.rows[0].id;

    const result = await pool.query(
      `
      INSERT INTO boot_reasons (
        organization_id,
        code,
        name,
        description,
        active
      )
      VALUES ($1, $2, $3, $4, true)
      ON CONFLICT (organization_id, code)
      DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        active = true
      RETURNING *
      `,
      [
        organizationId,
        code.trim().toUpperCase(),
        name.trim(),
        description || null
      ]
    );

    res.json({
      success: true,
      boot_reason: result.rows[0]
    });

  } catch (error) {
    console.error("Boot reason setup failed:", error);

    res.status(500).json({
      success: false,
      error: "Could not create boot reason"
    });
  }
});

app.post("/setup/technician", async (req, res) => {
  try {
    const setupSecret = req.headers["x-bootbros-setup-secret"];

    if (
      !process.env.BOOTBROS_SETUP_SECRET ||
      setupSecret !== process.env.BOOTBROS_SETUP_SECRET
    ) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized"
      });
    }

    const {
      email,
      technician_number,
      phone_number
    } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: "email is required"
      });
    }

    const organizationResult = await pool.query(
      `
      SELECT id
      FROM organizations
      WHERE slug = 'bootbros'
      LIMIT 1
      `
    );

    if (organizationResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "BootBros organization not found"
      });
    }

    const organizationId = organizationResult.rows[0].id;

    const userResult = await pool.query(
      `
      SELECT
        id,
        organization_id,
        email,
        first_name,
        last_name,
        role,
        active
      FROM users
      WHERE LOWER(email) = LOWER($1)
        AND organization_id = $2
      LIMIT 1
      `,
      [email.trim(), organizationId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "User not found. Create the user first."
      });
    }

    const user = userResult.rows[0];

    const technicianResult = await pool.query(
      `
      INSERT INTO technicians (
        user_id,
        technician_number,
        phone_number,
        active
      )
      VALUES ($1, $2, $3, true)
      ON CONFLICT (user_id)
      DO UPDATE SET
        technician_number = EXCLUDED.technician_number,
        phone_number = EXCLUDED.phone_number,
        active = true
      RETURNING *
      `,
      [
        user.id,
        technician_number || null,
        phone_number || null
      ]
    );

    res.json({
      success: true,
      technician: technicianResult.rows[0],
      user: user
    });

  } catch (error) {
    console.error("Technician setup failed:", error);

    res.status(500).json({
      success: false,
      error: "Could not create technician"
    });
  }
});

app.post("/setup/test-vehicle", async (req, res) => {
  try {
    const setupSecret = req.headers["x-bootbros-setup-secret"];

    if (
      !process.env.BOOTBROS_SETUP_SECRET ||
      setupSecret !== process.env.BOOTBROS_SETUP_SECRET
    ) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized"
      });
    }

    const organizationResult = await pool.query(
      `
      SELECT id
      FROM organizations
      WHERE slug = 'bootbros'
      LIMIT 1
      `
    );

    if (organizationResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "BootBros organization not found"
      });
    }

    const organizationId = organizationResult.rows[0].id;

    const vehicleResult = await pool.query(
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
        "BOOT456",
        "TEST",
        "Honda",
        "Accord",
        "Blue"
      ]
    );

    const vehicle = vehicleResult.rows[0];

    const violationResult = await pool.query(
      `
      INSERT INTO violations (
        organization_id,
        vehicle_id,
        violation_type,
        description,
        amount_due,
        status
      )
      VALUES ($1, $2, $3, $4, $5, 'open')
      RETURNING *
      `,
      [
        organizationId,
        vehicle.id,
        "UNPAID_CITATIONS",
        "Test unpaid parking citations",
        150.00
      ]
    );

    res.json({
      success: true,
      vehicle,
      violation: violationResult.rows[0]
    });

  } catch (error) {
    console.error("Test vehicle creation failed:", error);

    res.status(500).json({
      success: false,
      error: "Could not create test vehicle"
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

app.post("/api/boots", async (req, res) => {
  try {
    const {
      license_plate,
      reason_code,
      violation_id,
      citation_number,
      boot_device_id,
      boot_type,
      wheel_position,
      location,
      latitude,
      longitude,
      technician_id,
      evidence
    } = req.body;

    if (!license_plate) {
      return res.status(400).json({
        success: false,
        error: "license_plate is required"
      });
    }

    if (!reason_code) {
      return res.status(400).json({
        success: false,
        error: "reason_code is required"
      });
    }

    if (!boot_device_id) {
      return res.status(400).json({
        success: false,
        error: "boot_device_id is required"
      });
    }

    if (!boot_type) {
      return res.status(400).json({
        success: false,
        error: "boot_type is required"
      });
    }

    if (!wheel_position) {
      return res.status(400).json({
        success: false,
        error: "wheel_position is required"
      });
    }

    if (!technician_id) {
      return res.status(400).json({
        success: false,
        error: "technician_id is required"
      });
    }

    const plate = license_plate.trim().toUpperCase();

    // Find vehicle and organization
    const vehicleResult = await pool.query(
      `
      SELECT
        v.id AS vehicle_id,
        v.organization_id,
        v.license_plate
      FROM vehicles v
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

    // Verify technician belongs to the organization
    const technicianResult = await pool.query(
      `
      SELECT
        t.id,
        t.user_id,
        t.active
      FROM technicians t
      JOIN users u
        ON u.id = t.user_id
      WHERE t.id = $1
        AND u.organization_id = $2
        AND t.active = true
        AND u.active = true
      LIMIT 1
      `,
      [technician_id, vehicle.organization_id]
    );

    if (technicianResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        error: "Invalid or inactive technician"
      });
    }

    // Verify the boot reason is approved for this organization
    const reasonResult = await pool.query(
      `
      SELECT *
      FROM boot_reasons
      WHERE organization_id = $1
        AND code = $2
        AND active = true
      LIMIT 1
      `,
      [vehicle.organization_id, reason_code]
    );

    if (reasonResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Boot reason is not approved"
      });
    }

    // If a violation was supplied, make sure it belongs to this vehicle
    let violation = null;

    if (violation_id) {
      const violationResult = await pool.query(
        `
        SELECT *
        FROM violations
        WHERE id = $1
          AND vehicle_id = $2
          AND organization_id = $3
        LIMIT 1
        `,
        [
          violation_id,
          vehicle.vehicle_id,
          vehicle.organization_id
        ]
      );

      if (violationResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Invalid violation for this vehicle"
        });
      }

      violation = violationResult.rows[0];
    }

    // Prevent duplicate active boots
    const activeBootResult = await pool.query(
      `
      SELECT id
      FROM boots
      WHERE vehicle_id = $1
        AND status = 'active'
      LIMIT 1
      `,
      [vehicle.vehicle_id]
    );

    if (activeBootResult.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: "Vehicle already has an active boot",
        boot_id: activeBootResult.rows[0].id
      });
    }

    // Create the boot record
    const bootResult = await pool.query(
      `
      INSERT INTO boots (
        organization_id,
        vehicle_id,
        violation_id,
        status,
        location,
        technician_id,
        boot_device_id,
        boot_type,
        wheel_position,
        latitude,
        longitude
      )
      VALUES (
        $1, $2, $3, 'active', $4,
        $5, $6, $7, $8, $9, $10
      )
      RETURNING *
      `,
      [
        vehicle.organization_id,
        vehicle.vehicle_id,
        violation ? violation.id : null,
        location || null,
        technician_id,
        boot_device_id,
        boot_type,
        wheel_position,
        latitude || null,
        longitude || null
      ]
    );

    const boot = bootResult.rows[0];

    // Store citation information
    if (citation_number || violation) {
      await pool.query(
        `
        INSERT INTO boot_citations (
          boot_id,
          violation_id,
          citation_number,
          amount_due
        )
        VALUES ($1, $2, $3, $4)
        `,
        [
          boot.id,
          violation ? violation.id : null,
          citation_number || null,
          violation ? violation.amount_due : null
        ]
      );
    }

    // Store evidence records
    if (Array.isArray(evidence)) {
      for (const item of evidence) {
        if (!item || !item.evidence_type) {
          continue;
        }

        await pool.query(
          `
          INSERT INTO boot_evidence (
            boot_id,
            evidence_type,
            file_url,
            latitude,
            longitude
          )
          VALUES ($1, $2, $3, $4, $5)
          `,
          [
            boot.id,
            item.evidence_type,
            item.file_url || null,
            item.latitude || latitude || null,
            item.longitude || longitude || null
          ]
        );
      }
    }

    // Create audit record
    await pool.query(
      `
      INSERT INTO audit_logs (
        organization_id,
        technician_id,
        action,
        entity_type,
        entity_id,
        details
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        vehicle.organization_id,
        technician_id,
        "boot_installed",
        "boot",
        boot.id,
        JSON.stringify({
          license_plate: plate,
          reason_code,
          citation_number: citation_number || null,
          boot_device_id,
          boot_type,
          wheel_position,
          location: location || null,
          latitude: latitude || null,
          longitude: longitude || null,
          evidence_count: Array.isArray(evidence)
            ? evidence.length
            : 0
        })
      ]
    );

    res.status(201).json({
      success: true,
      message: "Boot installation recorded successfully",
      boot: {
        id: boot.id,
        vehicle_id: boot.vehicle_id,
        status: boot.status,
        boot_device_id: boot.boot_device_id,
        boot_type: boot.boot_type,
        wheel_position: boot.wheel_position,
        location: boot.location,
        latitude: boot.latitude,
        longitude: boot.longitude,
        booted_at: boot.booted_at,
        technician_id: boot.technician_id
      }
    });

  } catch (error) {
    console.error("Boot installation failed:", error);

    res.status(500).json({
      success: false,
      error: "Could not record boot installation"
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

app.get("/api/dashboard", async (req, res) => {
  try {
    const organizationResult = await pool.query(
      `
      SELECT id, name
      FROM organizations
      WHERE slug = 'bootbros'
      LIMIT 1
      `
    );

    if (organizationResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Organization not found"
      });
    }

    const organizationId = organizationResult.rows[0].id;

    const activeBootsResult = await pool.query(
      `
      SELECT COUNT(*)::int AS count
      FROM boots
      WHERE organization_id = $1
        AND status = 'active'
      `,
      [organizationId]
    );

    const removalRequestsResult = await pool.query(
      `
      SELECT COUNT(*)::int AS count
      FROM removal_requests
      WHERE organization_id = $1
        AND status IN (
          'requested',
          'assigned',
          'en_route',
          'in_progress'
        )
      `,
      [organizationId]
    );

    const todaysBootsResult = await pool.query(
      `
      SELECT COUNT(*)::int AS count
      FROM boots
      WHERE organization_id = $1
        AND booted_at >= CURRENT_DATE
        AND booted_at < CURRENT_DATE + INTERVAL '1 day'
      `,
      [organizationId]
    );

    const recentActivityResult = await pool.query(
      `
      SELECT
        b.id,
        v.license_plate,
        b.status,
        b.booted_at AS activity_time,
        'boot' AS activity_type
      FROM boots b
      JOIN vehicles v
        ON v.id = b.vehicle_id
      WHERE b.organization_id = $1

      UNION ALL

      SELECT
        rr.id,
        v.license_plate,
        rr.status,
        rr.requested_at AS activity_time,
        'removal_request' AS activity_type
      FROM removal_requests rr
      JOIN vehicles v
        ON v.id = rr.vehicle_id
      WHERE rr.organization_id = $1

      ORDER BY activity_time DESC
      LIMIT 10
      `,
      [organizationId]
    );

    res.json({
      success: true,

      organization: {
        id: organizationId,
        name: organizationResult.rows[0].name
      },

      stats: {
        activeBoots: activeBootsResult.rows[0].count,
        removalRequests: removalRequestsResult.rows[0].count,
        todaysBoots: todaysBootsResult.rows[0].count
      },

      recentActivity: recentActivityResult.rows
    });

  } catch (error) {
    console.error("Dashboard lookup failed:", error);

    res.status(500).json({
      success: false,
      error: "Could not load dashboard"
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
