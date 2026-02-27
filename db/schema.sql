create table if not exists app_config (
  id int primary key default 1,
  race_start_time timestamptz null,
  finish_time timestamptz null,
  updated_at timestamptz not null default now()
);

create table if not exists runners (
  runner_number int primary key check (runner_number between 1 and 12),
  name text not null,
  default_estimated_pace_spm int null,
  updated_at timestamptz not null default now()
);

create table if not exists legs (
  leg int primary key check (leg between 1 and 36),
  runner_number int not null references runners(runner_number),
  leg_mileage numeric(5,2) not null,
  elev_gain_ft int not null,
  elev_loss_ft int not null,
  net_elev_diff_ft int not null,
  exchange_label text not null,
  exchange_url text not null,
  updated_at timestamptz not null default now()
);

create table if not exists leg_inputs (
  leg int primary key references legs(leg),
  estimated_pace_override_spm int null,
  actual_start_time timestamptz null,
  updated_at timestamptz not null default now()
);
