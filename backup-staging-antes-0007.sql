PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE IF NOT EXISTS "d1_migrations"(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(1,'0001-schema.sql','2026-08-03 03:44:22');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(2,'0002-candidate-application.sql','2026-08-03 22:57:19');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(3,'0003-referral-source-other.sql','2026-08-03 22:57:19');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(4,'0004-normalize-course-slugs.sql','2026-08-04 19:03:45');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(5,'0005-member-auth.sql','2026-08-08 15:49:14');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(6,'0006-candidate-checkin.sql','2026-08-12 23:13:53');
CREATE TABLE roles (
  id    TEXT PRIMARY KEY,
  value TEXT NOT NULL UNIQUE
);
INSERT INTO "roles" ("id","value") VALUES('admin','admin');
INSERT INTO "roles" ("id","value") VALUES('avaliador','avaliador');
CREATE TABLE rooms (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  size INTEGER NOT NULL CHECK (size > 0)
);
CREATE TABLE metrics (
  id    TEXT PRIMARY KEY,
  type  TEXT,
  score INTEGER
);
CREATE TABLE users (
  id      TEXT PRIMARY KEY,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT ON UPDATE CASCADE,

  email    TEXT NOT NULL UNIQUE,
  name     TEXT NOT NULL,
  password TEXT,

  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT
, deactivated_at TEXT);
INSERT INTO "users" ("id","role_id","email","name","password","created_at","updated_at","deactivated_at") VALUES('ff531f02-23da-4ada-b6d2-975206cfcac9','avaliador','arthurteixeirasantos@gmail.com','arthur','pbkdf2-sha256$25000$L6Vz22pRbTggqFof0a9iPA$60lWinima2-4TfDDzEW4ah_VoTYmmBmnQ_KhwnirCoo','2026-08-08 17:46:59',NULL,NULL);
CREATE TABLE groups (
  id TEXT PRIMARY KEY,

  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT ON UPDATE CASCADE,

  name TEXT NOT NULL,

  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT
);
CREATE TABLE group_evaluators (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE ON UPDATE CASCADE,
  user_id  TEXT NOT NULL REFERENCES users(id)  ON DELETE CASCADE ON UPDATE CASCADE,

  PRIMARY KEY (group_id, user_id)
);
CREATE TABLE IF NOT EXISTS "candidates" (
  id TEXT PRIMARY KEY,

  course   TEXT NOT NULL,
  semester INTEGER NOT NULL CHECK (semester BETWEEN 1 AND 10),

  gender    TEXT NOT NULL CHECK (gender IN ('mascu', 'fem', 'outro')),
  ethnicity TEXT NOT NULL DEFAULT 'nao-informado' CHECK (ethnicity IN (
    'branca', 'preta', 'parda', 'amarela', 'indigena', 'nao-informado'
  )),

  name  TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL UNIQUE,

  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT
);
INSERT INTO "candidates" ("id","course","semester","gender","ethnicity","name","email","phone","created_at","updated_at") VALUES('6c4c883e-94d4-44f5-b558-1303153bab64','eng-computacao',8,'mascu','branca','aaa','arthurteixeirasantos@gmail.com','+5571983333931','2026-08-04 22:19:49',NULL);
INSERT INTO "candidates" ("id","course","semester","gender","ethnicity","name","email","phone","created_at","updated_at") VALUES('5a83ac5f-1c32-4d97-9bd5-a11058d0537c','eng-computacao',8,'mascu','parda','arthur','rutler.br@gmail.com','+5571983333930','2026-08-04 22:56:20',NULL);
INSERT INTO "candidates" ("id","course","semester","gender","ethnicity","name","email","phone","created_at","updated_at") VALUES('699d9613-3802-497d-bf3c-f357a796538e','eng-civil',7,'mascu','branca','Arthur Santos Teixeira','castro@gmail.com','+5571983333920','2026-08-08 16:09:30',NULL);
CREATE TABLE candidate_applications (
  id TEXT PRIMARY KEY,

  
  candidate_id TEXT NOT NULL UNIQUE REFERENCES candidates(id) ON DELETE CASCADE ON UPDATE CASCADE,

  referral_source TEXT NOT NULL CHECK (referral_source IN (
    'instagram', 'linkedin', 'campus', 'indicacao', 'outros'
  )),
  
  referral_source_other TEXT,

  mej_acknowledged     INTEGER NOT NULL CHECK (mej_acknowledged IN (0, 1)),
  experience           TEXT NOT NULL,
  motivation           TEXT NOT NULL,
  saturday_restriction INTEGER NOT NULL CHECK (saturday_restriction IN (0, 1)),
  special_needs        INTEGER NOT NULL CHECK (special_needs IN (0, 1)),

  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT
);
INSERT INTO "candidate_applications" ("id","candidate_id","referral_source","referral_source_other","mej_acknowledged","experience","motivation","saturday_restriction","special_needs","created_at","updated_at") VALUES('187641b1-c27b-48c5-9227-b288d9f8aeb3','6c4c883e-94d4-44f5-b558-1303153bab64','linkedin',NULL,1,'dasda','dasdas',0,0,'2026-08-04 22:19:49',NULL);
INSERT INTO "candidate_applications" ("id","candidate_id","referral_source","referral_source_other","mej_acknowledged","experience","motivation","saturday_restriction","special_needs","created_at","updated_at") VALUES('e6414ea7-18eb-4bdb-8469-25bc4cacdb9b','5a83ac5f-1c32-4d97-9bd5-a11058d0537c','outros','indicação',1,'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nulla blandit interdum dolor et blandit. Sed faucibus neque vel massa ultricies, vitae consequat est maximus. Donec vel pretium neque, in volutpat arcu. Integer id tortor elit. Nullam dui sem, fermentum ac rutrum sed, volutpat quis lacus. Vivamus blandit faucibus efficitur. Vestibulum eu odio ac dui pretium sollicitudin eget tempus lectus. Aliquam magna justo, viverra in','Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nulla blandit interdum dolor et blandit. Sed faucibus neque vel massa ultricies, vitae consequat est maximus. Donec vel pretium neque, in volutpat arcu. Integer id tortor elit. Nullam dui sem, fermentum ac rutrum sed, volutpat quis lacus. Vivamus blandit faucibus efficitur. Vestibulum eu odio ac dui pretium sollicitudin eget tempus lectus. Aliquam magna justo, viverra in',0,1,'2026-08-04 22:56:20',NULL);
INSERT INTO "candidate_applications" ("id","candidate_id","referral_source","referral_source_other","mej_acknowledged","experience","motivation","saturday_restriction","special_needs","created_at","updated_at") VALUES('55869cb1-c5ab-4830-bca9-1f30d51d8dc8','699d9613-3802-497d-bf3c-f357a796538e','linkedin',NULL,1,'ddasdasd','adasd',0,0,'2026-08-08 16:09:30',NULL);
CREATE TABLE group_candidates (
  group_id     TEXT NOT NULL REFERENCES groups(id)     ON DELETE CASCADE ON UPDATE CASCADE,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE ON UPDATE CASCADE,

  "order" INTEGER,

  PRIMARY KEY (group_id, candidate_id)
);
CREATE TABLE evaluations (
  id TEXT PRIMARY KEY,

  user_id      TEXT NOT NULL REFERENCES users(id)      ON DELETE RESTRICT ON UPDATE CASCADE,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  metrics_id   TEXT NOT NULL REFERENCES metrics(id)    ON DELETE RESTRICT ON UPDATE CASCADE,

  score    REAL,
  feedback TEXT,

  status TEXT NOT NULL DEFAULT 'RED' CHECK (status IN ('RED', 'YELLOW', 'GREEN')),

  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT
);
CREATE TABLE member_profiles (
  id      TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,

  
  
  
  member_id TEXT NOT NULL UNIQUE,

  full_name  TEXT NOT NULL,
  phone      TEXT NOT NULL,
  birth_date TEXT,

  course    TEXT NOT NULL,
  semester  INTEGER NOT NULL,
  gender    TEXT NOT NULL,
  ethnicity TEXT NOT NULL,
  status    TEXT NOT NULL,

  
  manager INTEGER NOT NULL DEFAULT 0,

  
  synced_at TEXT NOT NULL,

  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT
);
INSERT INTO "member_profiles" ("id","user_id","member_id","full_name","phone","birth_date","course","semester","gender","ethnicity","status","manager","synced_at","created_at","updated_at") VALUES('907ee70f-b79d-43d8-b4cd-f363f642e66d','ff531f02-23da-4ada-b6d2-975206cfcac9','868de2a0-c1d7-4905-89c7-ecb6fba37773','arthur','71981541779',NULL,'eng_computacao',6,'masc','parda','active',0,'2026-08-08T17:46:59.387Z','2026-08-08 17:46:59',NULL);
CREATE TABLE sessions (
  id      TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  refresh_token_hash TEXT NOT NULL UNIQUE,
  family_id          TEXT NOT NULL,

  expires_at TEXT NOT NULL,
  revoked_at TEXT,

  user_agent TEXT,

  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
INSERT INTO "sessions" ("id","user_id","refresh_token_hash","family_id","expires_at","revoked_at","user_agent","created_at") VALUES('06abbf2b-3ed8-4aa9-b608-b5c5044a0e9e','ff531f02-23da-4ada-b6d2-975206cfcac9','4957dbbbb81c87649d971cfd230965535b43eb5e75c5fa483ae814d27ca210de','78a9d3f0-c58b-440d-ac8c-534ecb941d4f','2026-08-19T23:06:18.583Z','2026-08-12T23:06:30.511Z','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-12 23:06:18');
INSERT INTO "sessions" ("id","user_id","refresh_token_hash","family_id","expires_at","revoked_at","user_agent","created_at") VALUES('047b8a51-0910-486b-8097-cd1233d78b60','ff531f02-23da-4ada-b6d2-975206cfcac9','35e5cafaf375a4c83bdc7f713f78fb049750eb6c46f592fae4e87613994be248','78a9d3f0-c58b-440d-ac8c-534ecb941d4f','2026-08-19T23:06:30.511Z',NULL,'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-12 23:06:30');
INSERT INTO "sessions" ("id","user_id","refresh_token_hash","family_id","expires_at","revoked_at","user_agent","created_at") VALUES('61ef9bf5-97bc-4c54-a97c-302e22f677f7','ff531f02-23da-4ada-b6d2-975206cfcac9','0eccc941ac720d79e6efd07f7045519f9cf19b3e0b682d6527c3cc884f7103d0','1985ea43-845d-445c-aba8-749ee5b8d76b','2026-08-19T23:06:35.055Z','2026-08-12T23:08:36.828Z','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-12 23:06:35');
INSERT INTO "sessions" ("id","user_id","refresh_token_hash","family_id","expires_at","revoked_at","user_agent","created_at") VALUES('a4ce5f6d-32d3-43f8-b74c-471aa281d19c','ff531f02-23da-4ada-b6d2-975206cfcac9','ce05e9d0feca144b0abcba5ea23f3e49cdabe69e2cc9204277e44d24290cf163','38b80013-7bf4-421e-9435-2e72319f6965','2026-08-19T23:08:43.887Z','2026-08-12T23:09:10.873Z','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-12 23:08:43');
INSERT INTO "sessions" ("id","user_id","refresh_token_hash","family_id","expires_at","revoked_at","user_agent","created_at") VALUES('ef1acdbf-d8dd-4ed6-a30e-c79c44106d68','ff531f02-23da-4ada-b6d2-975206cfcac9','0512ba19f45f3a7ae780cdb3308d3e92e7846a13680d8193385f3f3cf6a52e6a','38b80013-7bf4-421e-9435-2e72319f6965','2026-08-19T23:09:10.873Z','2026-08-12T23:14:12.835Z','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-12 23:09:10');
INSERT INTO "sessions" ("id","user_id","refresh_token_hash","family_id","expires_at","revoked_at","user_agent","created_at") VALUES('86d210f2-04ff-45dc-8c42-9710e2c95a27','ff531f02-23da-4ada-b6d2-975206cfcac9','ac621bae2db33470a8e6e28fb4ee76b2bbbb655c20c95e56d7630d977edd1688','38b80013-7bf4-421e-9435-2e72319f6965','2026-08-19T23:14:12.835Z','2026-08-12T23:15:17.602Z','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-12 23:14:12');
INSERT INTO "sessions" ("id","user_id","refresh_token_hash","family_id","expires_at","revoked_at","user_agent","created_at") VALUES('60208337-263e-4f69-876d-393849f2da81','ff531f02-23da-4ada-b6d2-975206cfcac9','e8ce137685fd160e7f89ae3ddd504b498ff25e88591f52868cde5214e07f939f','38b80013-7bf4-421e-9435-2e72319f6965','2026-08-19T23:15:17.602Z','2026-08-12T23:49:31.807Z','Mozilla/5.0 (iPhone; CPU iPhone OS 26_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1','2026-08-12 23:15:17');
INSERT INTO "sessions" ("id","user_id","refresh_token_hash","family_id","expires_at","revoked_at","user_agent","created_at") VALUES('a824183e-cb0f-4eaa-b743-a14a9e72b52b','ff531f02-23da-4ada-b6d2-975206cfcac9','32f6aa29a5b369d57615675540d722b891e741b31cc40b61e9e824e9921fccca','38b80013-7bf4-421e-9435-2e72319f6965','2026-08-19T23:49:31.807Z','2026-08-12T23:49:53.332Z','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-12 23:49:31');
INSERT INTO "sessions" ("id","user_id","refresh_token_hash","family_id","expires_at","revoked_at","user_agent","created_at") VALUES('19f52bae-5ed4-467b-b63d-03bdfa1c4400','ff531f02-23da-4ada-b6d2-975206cfcac9','7aede1b8cb780bf4f1e6af1be9caf6dfe4693c3894229a056b11bdac8b8ad4b0','38b80013-7bf4-421e-9435-2e72319f6965','2026-08-19T23:49:53.332Z','2026-08-12T23:49:59.853Z','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-12 23:49:53');
INSERT INTO "sessions" ("id","user_id","refresh_token_hash","family_id","expires_at","revoked_at","user_agent","created_at") VALUES('8ecbf40b-c852-4d42-9cf5-819191389b06','ff531f02-23da-4ada-b6d2-975206cfcac9','77c39e634593b1a2c19765beac3ac8975d15af7fc6c8a8538c684d21a2bcb682','38b80013-7bf4-421e-9435-2e72319f6965','2026-08-19T23:49:59.853Z','2026-08-12T23:52:32.110Z','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-12 23:49:59');
INSERT INTO "sessions" ("id","user_id","refresh_token_hash","family_id","expires_at","revoked_at","user_agent","created_at") VALUES('30da45c2-5ea5-4c6d-9900-3f9105bfcfc3','ff531f02-23da-4ada-b6d2-975206cfcac9','c8ef2fb92fddb75474872ed46f992ca207e8b0573703ccb1831fe63abaa25521','38b80013-7bf4-421e-9435-2e72319f6965','2026-08-19T23:52:32.110Z','2026-08-12T23:52:35.487Z','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-12 23:52:32');
INSERT INTO "sessions" ("id","user_id","refresh_token_hash","family_id","expires_at","revoked_at","user_agent","created_at") VALUES('7894f71f-2686-4f09-96ec-94fc83bdee9d','ff531f02-23da-4ada-b6d2-975206cfcac9','d45439243af8accf0192882fee3b59c7b8d20fc2934a95e5aee5b68ed84bdffa','38b80013-7bf4-421e-9435-2e72319f6965','2026-08-19T23:52:35.487Z','2026-08-12T23:52:35.938Z','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-12 23:52:35');
INSERT INTO "sessions" ("id","user_id","refresh_token_hash","family_id","expires_at","revoked_at","user_agent","created_at") VALUES('80965e03-ad63-407e-86e8-4e12799469f9','ff531f02-23da-4ada-b6d2-975206cfcac9','11a975604b4837f9d94c6bd0389b6e00ef31dd0cafb92c93a8b49f35d9001d0e','ca6bcab6-f574-46f6-9dec-4b47f5807c8d','2026-08-19T23:52:44.290Z','2026-08-12T23:52:58.240Z','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-12 23:52:44');
INSERT INTO "sessions" ("id","user_id","refresh_token_hash","family_id","expires_at","revoked_at","user_agent","created_at") VALUES('fa9a8282-07a1-48eb-b2b1-1663454f025d','ff531f02-23da-4ada-b6d2-975206cfcac9','a6e64120841b8e4fe0257cac30b011ef1a6ef86aceb1c05a3fba519a084d3b7b','ca6bcab6-f574-46f6-9dec-4b47f5807c8d','2026-08-19T23:52:58.240Z','2026-08-12T23:53:18.055Z','Mozilla/5.0 (iPhone; CPU iPhone OS 26_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1','2026-08-12 23:52:58');
INSERT INTO "sessions" ("id","user_id","refresh_token_hash","family_id","expires_at","revoked_at","user_agent","created_at") VALUES('de43934f-7177-4804-a45f-b32ac84a65fe','ff531f02-23da-4ada-b6d2-975206cfcac9','41ae547da9c6a9e2f20ede47a6e7bb5d97d87d56c6c51dc68d4ccb3c5a28761f','ca6bcab6-f574-46f6-9dec-4b47f5807c8d','2026-08-19T23:53:18.055Z','2026-08-12T23:53:30.766Z','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-12 23:53:18');
INSERT INTO "sessions" ("id","user_id","refresh_token_hash","family_id","expires_at","revoked_at","user_agent","created_at") VALUES('def8e7cb-99a6-4999-8441-f112fb3b5e08','ff531f02-23da-4ada-b6d2-975206cfcac9','ca0bc1f029b2898a36596e15b03ecab06339317a5b12b5fa0d7e599f0546cbc8','ca6bcab6-f574-46f6-9dec-4b47f5807c8d','2026-08-19T23:53:30.766Z','2026-08-12T23:54:15.748Z','Mozilla/5.0 (iPhone; CPU iPhone OS 26_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1','2026-08-12 23:53:30');
INSERT INTO "sessions" ("id","user_id","refresh_token_hash","family_id","expires_at","revoked_at","user_agent","created_at") VALUES('18c08df2-1de6-4ed7-83cd-c4cc65f26779','ff531f02-23da-4ada-b6d2-975206cfcac9','abd76ea98b01ece9f729d7d4c38a4785d70836e2adeb31c7c7c9a3d9c0fe8e34','9a36c31a-a845-405d-8fda-1a0de6d4d937','2026-08-19T23:54:30.628Z','2026-08-12T23:54:45.570Z','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-12 23:54:30');
INSERT INTO "sessions" ("id","user_id","refresh_token_hash","family_id","expires_at","revoked_at","user_agent","created_at") VALUES('50d88a57-0cae-4e8a-ab56-cdfb28cb7465','ff531f02-23da-4ada-b6d2-975206cfcac9','978b92feb0fa0723d4f14b89243ee3dfa9a64377295309d431015942b0ccda39','9a36c31a-a845-405d-8fda-1a0de6d4d937','2026-08-19T23:54:45.570Z','2026-08-12T23:55:41.094Z','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-12 23:54:45');
INSERT INTO "sessions" ("id","user_id","refresh_token_hash","family_id","expires_at","revoked_at","user_agent","created_at") VALUES('8f843415-f3d5-4c40-bb95-65f415d4350d','ff531f02-23da-4ada-b6d2-975206cfcac9','24b90ea022a5f2f51d7d74ce2857f3a7e66feecf8460abd6852404362708b4c5','9a36c31a-a845-405d-8fda-1a0de6d4d937','2026-08-19T23:55:41.094Z','2026-08-12T23:58:30.968Z','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-12 23:55:41');
INSERT INTO "sessions" ("id","user_id","refresh_token_hash","family_id","expires_at","revoked_at","user_agent","created_at") VALUES('f90e5b19-565d-4d5a-879d-ab75e60e90cb','ff531f02-23da-4ada-b6d2-975206cfcac9','9146c1fcf390da84bfc32396ffff9c4218ddd123740ed85270eb815980904fd4','9a36c31a-a845-405d-8fda-1a0de6d4d937','2026-08-19T23:58:30.968Z','2026-08-13T22:54:08.007Z','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-12 23:58:31');
INSERT INTO "sessions" ("id","user_id","refresh_token_hash","family_id","expires_at","revoked_at","user_agent","created_at") VALUES('3e0b6523-7f50-43a0-a88a-f423f5258abf','ff531f02-23da-4ada-b6d2-975206cfcac9','90f89b74000f4f68b18ddb6913297d37a98bf1551b39d9c08b13e22d65a47f9d','9a36c31a-a845-405d-8fda-1a0de6d4d937','2026-08-20T22:54:08.007Z','2026-08-13T22:54:10.729Z','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-13 22:54:08');
INSERT INTO "sessions" ("id","user_id","refresh_token_hash","family_id","expires_at","revoked_at","user_agent","created_at") VALUES('9375d79a-6174-43f4-a0a4-8410a2ec5430','ff531f02-23da-4ada-b6d2-975206cfcac9','fcb903ae8cc4a572168efb1980694fb6fefc519265e2c27a68a061d0c8b2c171','9a36c31a-a845-405d-8fda-1a0de6d4d937','2026-08-20T22:54:10.729Z','2026-08-13T22:54:11.775Z','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-13 22:54:10');
INSERT INTO "sessions" ("id","user_id","refresh_token_hash","family_id","expires_at","revoked_at","user_agent","created_at") VALUES('f4a3fad1-84ca-4a4a-b581-ba95162b24a9','ff531f02-23da-4ada-b6d2-975206cfcac9','df3b4022d2f72619713cf037ae4b1dbe4701138e82cac606e64235cebda909ed','9a36c31a-a845-405d-8fda-1a0de6d4d937','2026-08-20T22:54:11.775Z',NULL,'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-13 22:54:11');
INSERT INTO "sessions" ("id","user_id","refresh_token_hash","family_id","expires_at","revoked_at","user_agent","created_at") VALUES('c501120f-5238-4346-a33d-909deaaec6bc','ff531f02-23da-4ada-b6d2-975206cfcac9','72397af03bb65c48cb51eb6234b9fbf6191f9cc750ed4102eaf1ba081153927c','3bd9d195-18aa-43aa-b9ac-c85cd396b0ab','2026-08-20T22:55:12.857Z','2026-08-13T22:55:15.732Z','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-13 22:55:12');
INSERT INTO "sessions" ("id","user_id","refresh_token_hash","family_id","expires_at","revoked_at","user_agent","created_at") VALUES('4d78e515-cbbe-4cf0-b1bf-7673b97c5fb2','ff531f02-23da-4ada-b6d2-975206cfcac9','92a04105ec96609cc3683076e07f85088af1e06cf9889ee2df7bca4ceac563ee','3bd9d195-18aa-43aa-b9ac-c85cd396b0ab','2026-08-20T22:55:15.732Z','2026-08-13T22:55:54.554Z','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-13 22:55:15');
INSERT INTO "sessions" ("id","user_id","refresh_token_hash","family_id","expires_at","revoked_at","user_agent","created_at") VALUES('06cb80e3-82f7-41af-80c4-8b17b7d08754','ff531f02-23da-4ada-b6d2-975206cfcac9','84b115c8a9f569aa05632daf8a6ec99641b1df4ff0d9f38e785a6c5a3b74e3d2','3bd9d195-18aa-43aa-b9ac-c85cd396b0ab','2026-08-20T22:55:54.554Z','2026-08-13T22:56:21.703Z','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-13 22:55:54');
INSERT INTO "sessions" ("id","user_id","refresh_token_hash","family_id","expires_at","revoked_at","user_agent","created_at") VALUES('961ef9db-ec1e-4b92-ad81-191d8d5fc891','ff531f02-23da-4ada-b6d2-975206cfcac9','ce6060dbdf997d192a794c3b5ddf8a23a56b3c5370670f4da81dfcedcb8325d5','3bd9d195-18aa-43aa-b9ac-c85cd396b0ab','2026-08-20T22:56:21.703Z','2026-08-13T22:58:03.958Z','Mozilla/5.0 (iPhone; CPU iPhone OS 26_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1','2026-08-13 22:56:21');
INSERT INTO "sessions" ("id","user_id","refresh_token_hash","family_id","expires_at","revoked_at","user_agent","created_at") VALUES('699745ed-f156-4bcc-a31c-fde66dcca56a','ff531f02-23da-4ada-b6d2-975206cfcac9','f649471dee9c372d7efda9aa92c67cddff1a475226035e462e4de7c83dc2d55b','3bd9d195-18aa-43aa-b9ac-c85cd396b0ab','2026-08-20T22:58:03.958Z','2026-08-13T23:06:19.708Z','Mozilla/5.0 (iPhone; CPU iPhone OS 26_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1','2026-08-13 22:58:04');
INSERT INTO "sessions" ("id","user_id","refresh_token_hash","family_id","expires_at","revoked_at","user_agent","created_at") VALUES('3e5f7bd5-9e58-4189-8b1f-bdef3f775318','ff531f02-23da-4ada-b6d2-975206cfcac9','28510523f033b60fb2c17f51648e5bca2af856b625ee55279f43d4f37fc7763a','3bd9d195-18aa-43aa-b9ac-c85cd396b0ab','2026-08-20T23:06:19.708Z','2026-08-13T23:06:20.054Z','Mozilla/5.0 (iPhone; CPU iPhone OS 26_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1','2026-08-13 23:06:19');
INSERT INTO "sessions" ("id","user_id","refresh_token_hash","family_id","expires_at","revoked_at","user_agent","created_at") VALUES('8a283f8e-d767-4b4d-8a76-b5a7a895acae','ff531f02-23da-4ada-b6d2-975206cfcac9','c9a59f92538db070434be4b9c1fdfb369398ec635c8361dac13083f8d83c27f4','d21a3236-cc22-4f9d-a580-d1b1b803fc7a','2026-08-20T23:06:37.991Z',NULL,'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-13 23:06:38');
CREATE TABLE password_reset_tokens (
  id      TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  token_hash TEXT NOT NULL UNIQUE,

  expires_at TEXT NOT NULL,
  used_at    TEXT,

  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE TABLE selection_processes (
  id         TEXT PRIMARY KEY,
  label      TEXT NOT NULL UNIQUE,
  starts_at  TEXT NOT NULL,
  ends_at    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
INSERT INTO "selection_processes" ("id","label","starts_at","ends_at","created_at") VALUES('a1cc2644-d85c-44a7-87cb-60781d8d7464','2026.1','2026-01-01','2026-07-31 23:59:59','2026-08-12 23:13:53');
INSERT INTO "selection_processes" ("id","label","starts_at","ends_at","created_at") VALUES('ace24839-ec23-4942-9065-dbd45742034e','2026.2','2026-08-01','2026-12-31 23:59:59','2026-08-12 23:13:53');
CREATE TABLE candidate_checkins (
  id            TEXT PRIMARY KEY,
  candidate_id  TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  process_id    TEXT NOT NULL REFERENCES selection_processes(id) ON DELETE CASCADE,
  checked_in_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  checked_in_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  UNIQUE (candidate_id, process_id)
);
INSERT INTO "candidate_checkins" ("id","candidate_id","process_id","checked_in_by","checked_in_at") VALUES('3cae5edf-e6b6-44ec-b109-0988e06054d6','5a83ac5f-1c32-4d97-9bd5-a11058d0537c','ace24839-ec23-4942-9065-dbd45742034e','ff531f02-23da-4ada-b6d2-975206cfcac9','2026-08-13 22:57:33');
INSERT INTO "candidate_checkins" ("id","candidate_id","process_id","checked_in_by","checked_in_at") VALUES('e4d1522c-d346-4674-abfe-4c68aa1e657c','699d9613-3802-497d-bf3c-f357a796538e','ace24839-ec23-4942-9065-dbd45742034e','ff531f02-23da-4ada-b6d2-975206cfcac9','2026-08-13 22:57:55');
CREATE TABLE checkin_events (
  id           TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  process_id   TEXT NOT NULL REFERENCES selection_processes(id) ON DELETE CASCADE,
  action       TEXT NOT NULL CHECK (action IN ('marcou', 'desmarcou')),
  actor_id     TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at   TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
INSERT INTO "checkin_events" ("id","candidate_id","process_id","action","actor_id","created_at") VALUES('ae11aef2-2138-4db6-b93a-97b2792fe5a4','6c4c883e-94d4-44f5-b558-1303153bab64','ace24839-ec23-4942-9065-dbd45742034e','marcou','ff531f02-23da-4ada-b6d2-975206cfcac9','2026-08-12 23:15:04');
INSERT INTO "checkin_events" ("id","candidate_id","process_id","action","actor_id","created_at") VALUES('b117db62-0afb-4e27-b3f0-f929f5ce01c6','6c4c883e-94d4-44f5-b558-1303153bab64','ace24839-ec23-4942-9065-dbd45742034e','desmarcou','ff531f02-23da-4ada-b6d2-975206cfcac9','2026-08-12 23:15:22');
INSERT INTO "checkin_events" ("id","candidate_id","process_id","action","actor_id","created_at") VALUES('8b8717e6-c637-4dbf-be9c-a70342eacea5','5a83ac5f-1c32-4d97-9bd5-a11058d0537c','ace24839-ec23-4942-9065-dbd45742034e','marcou','ff531f02-23da-4ada-b6d2-975206cfcac9','2026-08-12 23:15:24');
INSERT INTO "checkin_events" ("id","candidate_id","process_id","action","actor_id","created_at") VALUES('280b44bd-d9a0-42e4-a961-96c9242f74e9','5a83ac5f-1c32-4d97-9bd5-a11058d0537c','ace24839-ec23-4942-9065-dbd45742034e','desmarcou','ff531f02-23da-4ada-b6d2-975206cfcac9','2026-08-12 23:15:28');
INSERT INTO "checkin_events" ("id","candidate_id","process_id","action","actor_id","created_at") VALUES('47e3cc30-b808-424b-8196-d74410d42687','699d9613-3802-497d-bf3c-f357a796538e','ace24839-ec23-4942-9065-dbd45742034e','marcou','ff531f02-23da-4ada-b6d2-975206cfcac9','2026-08-12 23:15:29');
INSERT INTO "checkin_events" ("id","candidate_id","process_id","action","actor_id","created_at") VALUES('6e46cc79-fbda-457d-9c91-f81eddb38823','699d9613-3802-497d-bf3c-f357a796538e','ace24839-ec23-4942-9065-dbd45742034e','desmarcou','ff531f02-23da-4ada-b6d2-975206cfcac9','2026-08-12 23:53:04');
INSERT INTO "checkin_events" ("id","candidate_id","process_id","action","actor_id","created_at") VALUES('26fd22bb-08e6-4d1a-8ca7-afbc0f045a99','6c4c883e-94d4-44f5-b558-1303153bab64','ace24839-ec23-4942-9065-dbd45742034e','marcou','ff531f02-23da-4ada-b6d2-975206cfcac9','2026-08-12 23:54:55');
INSERT INTO "checkin_events" ("id","candidate_id","process_id","action","actor_id","created_at") VALUES('60c0c2d9-3498-48d7-9477-624279591ae7','6c4c883e-94d4-44f5-b558-1303153bab64','ace24839-ec23-4942-9065-dbd45742034e','desmarcou','ff531f02-23da-4ada-b6d2-975206cfcac9','2026-08-12 23:55:17');
INSERT INTO "checkin_events" ("id","candidate_id","process_id","action","actor_id","created_at") VALUES('68c1ca16-5cf3-445c-a16d-fa488d132f67','6c4c883e-94d4-44f5-b558-1303153bab64','ace24839-ec23-4942-9065-dbd45742034e','marcou','ff531f02-23da-4ada-b6d2-975206cfcac9','2026-08-12 23:55:27');
INSERT INTO "checkin_events" ("id","candidate_id","process_id","action","actor_id","created_at") VALUES('dea1182a-ae53-437e-9e99-95cb25e7e213','6c4c883e-94d4-44f5-b558-1303153bab64','ace24839-ec23-4942-9065-dbd45742034e','desmarcou','ff531f02-23da-4ada-b6d2-975206cfcac9','2026-08-12 23:59:34');
INSERT INTO "checkin_events" ("id","candidate_id","process_id","action","actor_id","created_at") VALUES('0af8451e-7526-488f-8379-26cad6a659d5','6c4c883e-94d4-44f5-b558-1303153bab64','ace24839-ec23-4942-9065-dbd45742034e','marcou','ff531f02-23da-4ada-b6d2-975206cfcac9','2026-08-12 23:59:42');
INSERT INTO "checkin_events" ("id","candidate_id","process_id","action","actor_id","created_at") VALUES('2973946e-8921-4196-ae3f-46c81fdc874b','6c4c883e-94d4-44f5-b558-1303153bab64','ace24839-ec23-4942-9065-dbd45742034e','desmarcou','ff531f02-23da-4ada-b6d2-975206cfcac9','2026-08-13 22:55:30');
INSERT INTO "checkin_events" ("id","candidate_id","process_id","action","actor_id","created_at") VALUES('9dd5877e-d45b-4365-bc3f-08c3ac2e7fd4','6c4c883e-94d4-44f5-b558-1303153bab64','ace24839-ec23-4942-9065-dbd45742034e','marcou','ff531f02-23da-4ada-b6d2-975206cfcac9','2026-08-13 22:56:47');
INSERT INTO "checkin_events" ("id","candidate_id","process_id","action","actor_id","created_at") VALUES('8a258ab4-5bd9-44ef-9dc9-5d2c9e816711','6c4c883e-94d4-44f5-b558-1303153bab64','ace24839-ec23-4942-9065-dbd45742034e','desmarcou','ff531f02-23da-4ada-b6d2-975206cfcac9','2026-08-13 22:57:00');
INSERT INTO "checkin_events" ("id","candidate_id","process_id","action","actor_id","created_at") VALUES('bee84c93-d768-40e6-bfef-df018e2695a1','5a83ac5f-1c32-4d97-9bd5-a11058d0537c','ace24839-ec23-4942-9065-dbd45742034e','marcou','ff531f02-23da-4ada-b6d2-975206cfcac9','2026-08-13 22:57:33');
INSERT INTO "checkin_events" ("id","candidate_id","process_id","action","actor_id","created_at") VALUES('81e0bed7-4565-4d32-8355-c36582670dc7','699d9613-3802-497d-bf3c-f357a796538e','ace24839-ec23-4942-9065-dbd45742034e','marcou','ff531f02-23da-4ada-b6d2-975206cfcac9','2026-08-13 22:57:55');
DELETE FROM sqlite_sequence;
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('d1_migrations',6);
CREATE INDEX idx_user_role ON users(role_id);
CREATE INDEX idx_group_room ON groups(room_id);
CREATE INDEX idx_group_eval_group ON group_evaluators(group_id);
CREATE INDEX idx_candidate_app_candidate ON candidate_applications(candidate_id);
CREATE INDEX idx_group_cand_group ON group_candidates(group_id);
CREATE INDEX idx_evaluation_user      ON evaluations(user_id);
CREATE INDEX idx_evaluation_candidate ON evaluations(candidate_id);
CREATE INDEX idx_evaluation_metrics   ON evaluations(metrics_id);
CREATE INDEX idx_evaluation_status    ON evaluations(status);
CREATE UNIQUE INDEX uq_evaluation_pair ON evaluations(user_id, candidate_id, metrics_id);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_family ON sessions(family_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
CREATE INDEX idx_reset_tokens_user ON password_reset_tokens(user_id);
CREATE INDEX idx_candidate_checkins_process ON candidate_checkins(process_id);
CREATE INDEX idx_candidates_created_at ON candidates(created_at);
CREATE INDEX idx_checkin_events_process   ON checkin_events(process_id, created_at);
CREATE INDEX idx_checkin_events_candidate ON checkin_events(candidate_id);
