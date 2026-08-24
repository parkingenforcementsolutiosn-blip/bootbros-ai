import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false
});

const schema = `
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
`;

async function initDatabase() {
  try {
    await pool.query(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
    `);

    await pool.query(schema);

    console.log("BootBros database initialized successfully.");

    await pool.end();
  } catch (error) {
    console.error("Database initialization failed:", error);
    process.exit(1);
  }
}

initDatabase();
