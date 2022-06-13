-- Users

CREATE TYPE UserClassEnum AS ENUM ('superadmin', 'admin', 'master_ib', 'agent', 'staff', 'user');

CREATE TABLE users (
	id int8 NOT NULL,
	created timestamp with time zone DEFAULT now() NOT NULL,
	username text NOT NULL,
	phone_number text,
	email text,
	password text NOT NULL,
	mfa_secret text,
	balance_satoshis int8 DEFAULT 0 NOT NULL,
	prev_balance_satoshis int8 DEFAULT 0 NOT NULL,
	capture_pay int8 DEFAULT 0 NOT NULL,
	gross_profit int8 DEFAULT 0 NOT NULL,
	net_profit int8 DEFAULT 0 NOT NULL,
	games_played int8 DEFAULT 0 NOT NULL,
	userclass UserClassEnum DEFAULT 'user' NOT NULL,
	did_ref_deposit bool DEFAULT false,
	ref_id text,
	master_ib text,
	parent1 text,
	parent2 text,
	parent3 text,
	path text,
	ref_staff_id int8,
	demo bool DEFAULT false,
	demo_password text,
	is_parent bool DEFAULT false,
	agent_profit int8 DEFAULT 0,
	play_times_profit int8 DEFAULT 0,
	first_deposit_profit int8 DEFAULT 0,
	welcome_free_bit int8 DEFAULT 0,
	can_chat bool DEFAULT true,
	playing bool DEFAULT false,
	is_deleted bool DEFAULT false,
	token_address text
);

ALTER TABLE ONLY users
	ADD CONSTRAINT users_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX unique_username ON users USING btree (lower(username));
CREATE INDEX users_email_idx ON users USING btree (lower(email));
CREATE INDEX user_id_idx ON users USING btree (id);

CREATE SEQUENCE users_id_seq
	START WITH 1
	INCREMENT BY 1
	NO MINVALUE
	NO MAXVALUE
	CACHE 1;
ALTER SEQUENCE users_id_seq OWNED BY users.id;

ALTER TABLE ONLY users ALTER COLUMN id SET DEFAULT nextval('users_id_seq'::regclass);

-- Staff

CREATE TABLE staff (
	emp_id int8 NOT NULL,
	emp_name text NOT NULL,
	email text,
	processed int8,
	CONSTRAINT staff_pkey PRIMARY KEY (emp_id)
);


-- BTC Blocks

CREATE TABLE btc_blocks (
	height int8 NOT NULL,
	hash text NOT NULL
);

ALTER TABLE ONLY btc_blocks
	ADD CONSTRAINT bv_btc_blocks_pkey PRIMARY KEY (height, hash);


-- ETH Blocks

CREATE TABLE eth_blocks (
	height int8 NOT NULL,
	hash text NOT NULL
);

ALTER TABLE ONLY eth_blocks
	ADD CONSTRAINT bv_eth_blocks_pkey PRIMARY KEY (height, hash);



-- Fundings

CREATE TABLE fundings (
	id bigserial NOT NULL PRIMARY KEY,
	user_id int8 NOT NULL REFERENCES users(id),
	amount int8 NOT NULL,
	fee int8 DEFAULT 0 NOT NULL,
	withdrawal_txid text,
	withdrawal_address text,
	created timestamp with time zone DEFAULT now() NOT NULL,
	description text,
	deposit_txid text,
	withdrawal_id UUID,
	baseunit float8,
	currency text,
	CONSTRAINT fundings_withdrawal_id_key UNIQUE (withdrawal_id)
);

ALTER TABLE ONLY fundings
	ADD CONSTRAINT fundings_user_id_deposit_txid_key UNIQUE (user_id, deposit_txid);

CREATE INDEX fundings_user_id_idx ON fundings USING btree (user_id);



-- Games

CREATE TABLE games (
	id int8 NOT NULL,
	game_crash int8 NOT NULL,
	created timestamp with time zone DEFAULT now() NOT NULL,
	ended boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY games ADD CONSTRAINT games_pkey PRIMARY KEY (id);

CREATE SEQUENCE games_id_seq
	START WITH 1
	INCREMENT BY 1
	NO MINVALUE
	NO MAXVALUE
	CACHE 1;

ALTER SEQUENCE games_id_seq OWNED BY games.id;

ALTER TABLE ONLY games ALTER COLUMN id SET DEFAULT nextval('games_id_seq'::regclass);

-- Login Bonus
CREATE TABLE login_bonus
(
	id int8 NOT NULL,
	bonus int8,
	CONSTRAINT login_bonus_pkey PRIMARY KEY (id)
);

-- Common
CREATE TABLE common
(
	strKey text,
	strValue text
);

-- Withdraw_Verify
CREATE TABLE withdraw_verify
(
	id int8 NOT NULL,
	verify_code text,
	CONSTRAINT withdraw_verify_pkey PRIMARY KEY (id)
);

-- Register
CREATE TABLE register
(
	username text NOT NULL,
	phone_number text,
	created timestamp with time zone DEFAULT NOW(),
	email text,
	password text,
	ref_id text,
	ip_address text,
	user_agent text,
	verify_code text,
	check_count int4 DEFAULT 0,
	CONSTRAINT register_pkey PRIMARY KEY (username)
);

-- IB_Ranking
CREATE TABLE ib_ranking
(
	id int8 NOT NULL,
	user_id int8,
	rank int8,
	amount int8,
	CONSTRAINT ib_ranking_pkey PRIMARY KEY (id)
);

-- transfers
CREATE TABLE transfers
(
	id text NOT NULL,
	from_user_id int8,
	to_user_id int8,
	amount int8 DEFAULT 0,
	fee int8 DEFAULT 0,
	created timestamp with time zone,
	CONSTRAINT transfers_pkey PRIMARY KEY (id)
);

-- eth_deposit_src
CREATE TABLE eth_deposit_src
(
	user_id int8,
	eth_addr text,
	CONSTRAINT eth_deposit_src_pkey PRIMARY KEY (user_id)
);

-- tutorials
CREATE TABLE tutorials
(
	nid int8 NOT NULL,
	title text,
	url text,
	CONSTRAINT tutorials_pkey PRIMARY KEY (nid)
);

-- Intervals
CREATE TABLE intervals
(
	nId int8 NOT NULL,
	interval_start int8,
	interval_end int8,
	percentage int8,
	CONSTRAINT interval_pkey PRIMARY KEY (nId)
);

-- Supports
CREATE TABLE supports (
	id int8 NOT NULL,
	user_id int8 NOT NULL,
	email text,
	message_to_admin text,
	message_to_user text,
	created timestamp with time zone DEFAULT now() NOT NULL,
	read bool DEFAULT false,
	reply_check bool DEFAULT false,
	replied timestamp with time zone
);

ALTER TABLE ONLY supports ADD CONSTRAINT supports_pkey PRIMARY KEY (id);

CREATE SEQUENCE supports_id_seq
	START WITH 1
	INCREMENT BY 1
	NO MINVALUE
	NO MAXVALUE
	CACHE 1;

ALTER SEQUENCE supports_id_seq OWNED BY supports.id;

ALTER TABLE ONLY supports ALTER COLUMN id SET DEFAULT nextval('supports_id_seq'::regclass);

-- Giveaways

CREATE TABLE giveaways (
	id int8 NOT NULL,
	amount int8 NOT NULL,
	created timestamp with time zone DEFAULT now() NOT NULL,
	user_id int8 NOT NULL	
);

CREATE INDEX giveaways_user_id_idx ON giveaways USING btree (user_id);

CREATE SEQUENCE giveaways_id_seq
	START WITH 1
	INCREMENT BY 1
	NO MINVALUE
	NO MAXVALUE
	CACHE 1;

ALTER SEQUENCE giveaways_id_seq OWNED BY giveaways.id;

ALTER TABLE ONLY giveaways ALTER COLUMN id SET DEFAULT nextval('giveaways_id_seq'::regclass);

ALTER TABLE ONLY giveaways ADD CONSTRAINT giveaways_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE;



-- Plays

CREATE TABLE plays (
	id int8 NOT NULL,
	user_id int8 NOT NULL,
	cash_out int8 DEFAULT 0,
	auto_cash_out int8 NOT NULL,
	game_id int8 NOT NULL,
	created timestamp with time zone DEFAULT now() NOT NULL,
	bet int8 DEFAULT 0,
	extra_bet int8 DEFAULT 0,
	range_bet int8 DEFAULT 0,
	balance_satoshis int8 DEFAULT 0,
	profit_for_company int8 DEFAULT 0,
	profit_for_staff int8 DEFAULT 0,
	profit_for_master_ib int8 DEFAULT 0,
	profit_for_player int8 DEFAULT 0,
	profit_for_parent1 int8 DEFAULT 0,
	profit_for_parent2 int8 DEFAULT 0,
	profit_for_parent3 int8 DEFAULT 0,
	profit_for_agent int8 DEFAULT 0,
	user_parent1 text,
	user_parent2 text,
	user_parent3 text,
	user_master_ib text,
	agent_profit int8 DEFAULT 0,
	play_times_profit int8 DEFAULT 0,
	first_deposit_profit int8 DEFAULT 0,
	login_bonus_count int8 DEFAULT 0,
	demo bool DEFAULT false,
	username text,
	userclass text,
	range_bet_amount int8 DEFAULT 0,
	range_bet_from int8,
	range_bet_to int8,
	range_bet_multiplier float8
);

ALTER TABLE ONLY plays ADD CONSTRAINT plays_pkey PRIMARY KEY (id);

CREATE INDEX plays_game_id_idx ON plays USING btree (game_id);

CREATE INDEX plays_user_id_idx ON plays USING btree (user_id, id DESC);

ALTER TABLE ONLY plays ADD CONSTRAINT plays_game_id_fkey FOREIGN KEY (game_id) REFERENCES games(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY plays ADD CONSTRAINT plays_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE;

CREATE SEQUENCE plays_id_seq
	START WITH 1
	INCREMENT BY 1
	NO MINVALUE
	NO MAXVALUE
	CACHE 1;

ALTER SEQUENCE plays_id_seq OWNED BY plays.id;

ALTER TABLE ONLY plays ALTER COLUMN id SET DEFAULT nextval('plays_id_seq'::regclass);



-- Recovery

CREATE TABLE recovery (
	id uuid NOT NULL PRIMARY KEY,
	user_id int8 NOT NULL REFERENCES users(id),
	ip inet NOT NULL,
	created timestamp with time zone DEFAULT now() NOT NULL,
	expired timestamp with time zone DEFAULT now() + interval '15 minutes',
	used boolean NOT NULL DEFAULT false
);
CREATE INDEX fki_foreing_user_id ON recovery USING btree (user_id);



-- Sessions:
	-- Regular sessions for users and one time tokens for the cross origin connection to the game server
	-- Ott allows to let the session is http only

CREATE TABLE sessions (
	id uuid NOT NULL,
	user_id int8 NOT NULL,
	ip_address inet NOT NULL,
	user_agent text,
	ott boolean DEFAULT false,
	created timestamp with time zone NOT NULL DEFAULT now(),
	expired timestamp with time zone NOT NULL DEFAULT now() + interval '21 days',
	time_zone text
);

ALTER TABLE ONLY sessions
	ADD CONSTRAINT unique_id PRIMARY KEY (id);

CREATE INDEX sessions_user_id_idx ON sessions USING btree (user_id, expired);



-- Users View

CREATE VIEW users_view AS
 SELECT u.id,
	u.created,
	u.username,
	u.email,
	u.password,
	u.mfa_secret,
	u.balance_satoshis,
	( SELECT max(giveaways.created) AS max
		   FROM giveaways
		  WHERE (giveaways.user_id = u.id)) AS last_giveaway,
	u.userclass,
	u.demo,
	u.token_address,
	( SELECT sessions.time_zone
		   FROM sessions
		  WHERE ((sessions.time_zone <> ''::text) AND (sessions.user_id = u.id))
		  ORDER BY sessions.created DESC
		 LIMIT 1) AS time_zone
   FROM users u;


CREATE TABLE game_hashes
(
 game_id int8 NOT NULL,
 hash text NOT NULL,
 CONSTRAINT game_hashes_pkey PRIMARY KEY (game_id)
);

-- Chat messages

CREATE TABLE chat_messages
(
  id bigserial NOT NULL PRIMARY KEY,
  user_id int8 NOT NULL REFERENCES users(id),
  message text NOT NULL,
  created timestamp with time zone DEFAULT now() NOT NULL,
  is_bot boolean NOT NULL,
  channel text NOT NULL
);

CREATE INDEX chat_messages_user_id_idx ON chat_messages USING btree(user_id);
CREATE INDEX chat_messages_channel_id_idx ON chat_messages USING btree(channel, id);

-- Top Players
CREATE TABLE top_players
(
	id bigserial NOT NULL PRIMARY KEY,
	username int8 NOT NULL,
	profit int8 NOT NULL
);

CREATE TABLE range_bet
(
	id bigserial NOT NULL PRIMARY KEY,
	range_from int8 NOT NULL,
	range_to int8 NOT NULL,
	range_multiplier float8  NOT NULL
);