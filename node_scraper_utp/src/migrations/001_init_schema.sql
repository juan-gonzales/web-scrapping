CREATE TABLE IF NOT EXISTS web_scraper_events (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_info_web_scrapper (
  id SERIAL PRIMARY KEY,
  analyzed_system VARCHAR(10) NOT NULL,
  student_code VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  extra_information JSONB,
  web_scraper_event_id INT NOT NULL REFERENCES web_scraper_events(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (analyzed_system, student_code, web_scraper_event_id)
);

CREATE TABLE IF NOT EXISTS courses (
  id SERIAL PRIMARY KEY,
  student_info_id INT NOT NULL REFERENCES student_info_web_scrapper(id) ON DELETE CASCADE,
  web_scraper_event_id INT NOT NULL REFERENCES web_scraper_events(id) ON DELETE CASCADE,
  course_code VARCHAR(64),
  course VARCHAR(256),
  weekly_hours VARCHAR(32),
  credits VARCHAR(32),
  cycle VARCHAR(32),
  enrollment SMALLINT,
  course_type VARCHAR(64),
  section VARCHAR(32),
  extra_buttons TEXT,
  available_sections JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_schedules (
  id SERIAL PRIMARY KEY,
  student_info_id INT NOT NULL REFERENCES student_info_web_scrapper(id) ON DELETE CASCADE,
  web_scraper_event_id INT NOT NULL REFERENCES web_scraper_events(id) ON DELETE CASCADE,
  content_information JSONB,
  weekly_timetable JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
