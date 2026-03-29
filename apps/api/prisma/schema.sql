-- =============================================================================
-- NITBox Database Schema — PostgreSQL DDL
-- 3NF compliant · Aligned with API-Football v3
-- =============================================================================

-- ---------------------------------------------------------------------------
-- CONFEDERATIONS
-- ---------------------------------------------------------------------------
CREATE TABLE confederations (
    id         SERIAL       PRIMARY KEY,
    code       VARCHAR(10)  NOT NULL UNIQUE,   -- "UEFA", "CONMEBOL", "CAF", "AFC", "CONCACAF", "OFC", "FIFA"
    name       VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- COUNTRIES
-- ---------------------------------------------------------------------------
CREATE TABLE countries (
    id               SERIAL       PRIMARY KEY,
    iso_alpha2       VARCHAR(2)   NOT NULL UNIQUE,
    iso_alpha3       VARCHAR(3)   NOT NULL UNIQUE,
    name             VARCHAR(100) NOT NULL UNIQUE,
    flag_url         VARCHAR(500),
    confederation_id INT          NOT NULL REFERENCES confederations(id),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- VENUES                          source: GET /teams → venue.*
-- ---------------------------------------------------------------------------
CREATE TABLE venues (
    id               SERIAL       PRIMARY KEY,
    api_football_id  INT          UNIQUE,          -- venue.id
    name             VARCHAR(200) NOT NULL,
    address          VARCHAR(255),                 -- venue.address
    city             VARCHAR(100) NOT NULL,
    country_id       INT          NOT NULL REFERENCES countries(id),
    capacity         INT,
    surface_type     VARCHAR(50),                  -- venue.surface ("grass", "artificial")
    image_url        VARCHAR(500),                 -- venue.image
    latitude         FLOAT,
    longitude        FLOAT,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (name, country_id)
);

-- ---------------------------------------------------------------------------
-- NATIONAL TEAMS                  source: GET /teams → team.*
-- ---------------------------------------------------------------------------
CREATE TABLE national_teams (
    id               SERIAL       PRIMARY KEY,
    api_football_id  INT          NOT NULL UNIQUE, -- team.id
    country_id       INT          NOT NULL UNIQUE REFERENCES countries(id),
    fifa_code        VARCHAR(3)   NOT NULL UNIQUE, -- team.code e.g. "BRA"
    name             VARCHAR(100) NOT NULL,        -- team.name
    logo_url         VARCHAR(500),                 -- team.logo
    founded          INT,                          -- team.founded (year)
    national         BOOLEAN      NOT NULL DEFAULT TRUE,  -- team.national
    fifa_ranking     INT,
    nickname         VARCHAR(100),
    kit_primary      VARCHAR(20),
    kit_secondary    VARCHAR(20),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- COMPETITIONS                    source: GET /leagues → league.*
-- ---------------------------------------------------------------------------
CREATE TABLE competitions (
    id               SERIAL       PRIMARY KEY,
    api_football_id  INT          NOT NULL UNIQUE, -- league.id
    name             VARCHAR(200) NOT NULL UNIQUE,
    short_name       VARCHAR(50),
    type             VARCHAR(50)  NOT NULL,        -- "world_cup", "continental", "qualifier", "friendly"
    confederation_id INT          REFERENCES confederations(id),
    logo_url         VARCHAR(500),                 -- league.logo
    flag_url         VARCHAR(500),                 -- league.flag
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- COMPETITION SEASONS             source: GET /leagues → seasons[]
-- ---------------------------------------------------------------------------
CREATE TABLE competition_seasons (
    id                    SERIAL       PRIMARY KEY,
    competition_id        INT          NOT NULL REFERENCES competitions(id),
    api_football_season   INT,                     -- league.season integer e.g. 2024
    label                 VARCHAR(20)  NOT NULL,   -- display label "2026" or "2025/26"
    start_date            DATE         NOT NULL,
    end_date              DATE         NOT NULL,
    is_current            BOOLEAN      NOT NULL DEFAULT FALSE,  -- seasons[].current
    host_country_id       INT          REFERENCES countries(id),
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (competition_id, label)
);

-- ---------------------------------------------------------------------------
-- COMPETITION GROUPS
-- ---------------------------------------------------------------------------
CREATE TABLE competition_groups (
    id                    SERIAL      PRIMARY KEY,
    competition_season_id INT         NOT NULL REFERENCES competition_seasons(id),
    name                  VARCHAR(50) NOT NULL,    -- "Group A", "Round of 16", "Final"
    stage                 VARCHAR(50) NOT NULL,    -- "group", "knockout"
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (competition_season_id, name)
);

-- ---------------------------------------------------------------------------
-- STANDINGS                       source: GET /standings
-- ---------------------------------------------------------------------------
CREATE TABLE standings (
    id                    SERIAL      PRIMARY KEY,
    competition_season_id INT         NOT NULL REFERENCES competition_seasons(id),
    group_id              INT         REFERENCES competition_groups(id),
    team_id               INT         NOT NULL REFERENCES national_teams(id),

    position              INT         NOT NULL,
    form                  VARCHAR(20),              -- "WWDLW"
    status                VARCHAR(20),              -- "same", "up", "down"
    description           VARCHAR(255),             -- "Qualified - Next Round"

    -- Aggregate totals
    played                INT         NOT NULL DEFAULT 0,
    won                   INT         NOT NULL DEFAULT 0,
    drawn                 INT         NOT NULL DEFAULT 0,
    lost                  INT         NOT NULL DEFAULT 0,
    goals_for             INT         NOT NULL DEFAULT 0,
    goals_against         INT         NOT NULL DEFAULT 0,
    goal_difference       INT         NOT NULL DEFAULT 0,
    points                INT         NOT NULL DEFAULT 0,

    -- Home split
    home_played           INT         NOT NULL DEFAULT 0,
    home_won              INT         NOT NULL DEFAULT 0,
    home_drawn            INT         NOT NULL DEFAULT 0,
    home_lost             INT         NOT NULL DEFAULT 0,
    home_goals_for        INT         NOT NULL DEFAULT 0,
    home_goals_against    INT         NOT NULL DEFAULT 0,

    -- Away split
    away_played           INT         NOT NULL DEFAULT 0,
    away_won              INT         NOT NULL DEFAULT 0,
    away_drawn            INT         NOT NULL DEFAULT 0,
    away_lost             INT         NOT NULL DEFAULT 0,
    away_goals_for        INT         NOT NULL DEFAULT 0,
    away_goals_against    INT         NOT NULL DEFAULT 0,

    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (competition_season_id, group_id, team_id)
);

-- ---------------------------------------------------------------------------
-- COACHES                         source: GET /coachs
-- ---------------------------------------------------------------------------
CREATE TABLE coaches (
    id               SERIAL       PRIMARY KEY,
    api_football_id  INT          UNIQUE,           -- id from GET /coachs
    first_name       VARCHAR(100) NOT NULL,
    last_name        VARCHAR(100) NOT NULL,
    date_of_birth    DATE,
    birth_place      VARCHAR(100),                  -- birth.place
    birth_country_id INT          REFERENCES countries(id),
    nationality      VARCHAR(100),
    height_cm        INT,                           -- parsed from "180 cm"
    weight_kg        INT,                           -- parsed from "75 kg"
    photo_url        VARCHAR(500),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- COACH ASSIGNMENTS
-- ---------------------------------------------------------------------------
CREATE TABLE coach_assignments (
    id         SERIAL      PRIMARY KEY,
    coach_id   INT         NOT NULL REFERENCES coaches(id),
    team_id    INT         NOT NULL REFERENCES national_teams(id),
    role       VARCHAR(50) NOT NULL,   -- "head_coach", "assistant", "goalkeeper_coach"
    start_date DATE        NOT NULL,
    end_date   DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- PLAYERS                         source: GET /players → player.*
-- ---------------------------------------------------------------------------
CREATE TABLE players (
    id               SERIAL       PRIMARY KEY,
    api_football_id  INT          NOT NULL UNIQUE,  -- player.id
    first_name       VARCHAR(100) NOT NULL,
    last_name        VARCHAR(100) NOT NULL,
    common_name      VARCHAR(100),                  -- player.name (display name)
    date_of_birth    DATE         NOT NULL,
    birth_place      VARCHAR(100),                  -- birth.place
    birth_country_id INT          REFERENCES countries(id),
    nationality_id   INT          NOT NULL REFERENCES countries(id),
    position         VARCHAR(30)  NOT NULL,          -- "GK","CB","LB","CDM","CM","CAM","LW","RW","ST"
    preferred_foot   VARCHAR(5),                    -- "left", "right", "both"
    height_cm        INT,                           -- parsed from "175 cm"
    weight_kg        INT,                           -- parsed from "68 kg"
    shirt_number     INT,
    photo_url        VARCHAR(500),
    is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
    is_injured       BOOLEAN      NOT NULL DEFAULT FALSE,  -- player.injured
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- SQUADS
-- ---------------------------------------------------------------------------
CREATE TABLE squads (
    id                    SERIAL       PRIMARY KEY,
    team_id               INT          NOT NULL REFERENCES national_teams(id),
    competition_season_id INT          REFERENCES competition_seasons(id),
    label                 VARCHAR(100) NOT NULL,
    announced_at          TIMESTAMPTZ,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (team_id, competition_season_id)
);

-- ---------------------------------------------------------------------------
-- SQUAD PLAYERS
-- ---------------------------------------------------------------------------
CREATE TABLE squad_players (
    id           SERIAL      PRIMARY KEY,
    squad_id     INT         NOT NULL REFERENCES squads(id),
    player_id    INT         NOT NULL REFERENCES players(id),
    shirt_number INT,
    is_captain   BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (squad_id, player_id)
);

-- ---------------------------------------------------------------------------
-- MATCHES                         source: GET /fixtures → fixture.*
-- ---------------------------------------------------------------------------
CREATE TABLE matches (
    id                    SERIAL       PRIMARY KEY,
    api_football_id       INT          NOT NULL UNIQUE,  -- fixture.id
    competition_season_id INT          NOT NULL REFERENCES competition_seasons(id),
    group_id              INT          REFERENCES competition_groups(id),
    home_team_id          INT          NOT NULL REFERENCES national_teams(id),
    away_team_id          INT          NOT NULL REFERENCES national_teams(id),
    venue_id              INT          REFERENCES venues(id),

    -- Scheduling
    kickoff_at            TIMESTAMPTZ  NOT NULL,
    timezone              VARCHAR(50),               -- fixture.timezone
    timestamp             INT,                       -- fixture.timestamp (Unix epoch)
    period_first_start    INT,                       -- fixture.periods.first
    period_second_start   INT,                       -- fixture.periods.second

    -- Status
    status_short          VARCHAR(10)  NOT NULL,     -- "FT","NS","1H","HT","AET","PEN"
    status_long           VARCHAR(50),               -- "Match Finished"
    status_elapsed        INT,                       -- fixture.status.elapsed
    status_extra          INT,                       -- fixture.status.extra

    -- Match info
    matchday              INT,
    round_label           VARCHAR(50),               -- league.round
    neutral_venue         BOOLEAN      NOT NULL DEFAULT FALSE,
    attendance_actual     INT,
    referee_main          VARCHAR(100),

    -- Score
    home_score            INT,                       -- score.fulltime.home
    away_score            INT,                       -- score.fulltime.away
    home_score_ht         INT,                       -- score.halftime.home
    away_score_ht         INT,                       -- score.halftime.away
    home_score_et         INT,                       -- score.extratime.home
    away_score_et         INT,                       -- score.extratime.away
    home_pen_score        INT,                       -- score.penalty.home
    away_pen_score        INT,                       -- score.penalty.away

    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_different_teams CHECK (home_team_id <> away_team_id)
);

-- ---------------------------------------------------------------------------
-- MATCH TEAM STATISTICS           source: GET /fixtures/statistics
-- ---------------------------------------------------------------------------
CREATE TABLE match_team_statistics (
    id                 SERIAL      PRIMARY KEY,
    match_id           INT         NOT NULL REFERENCES matches(id),
    team_id            INT         NOT NULL REFERENCES national_teams(id),
    is_home            BOOLEAN     NOT NULL,

    possession_pct     FLOAT,                -- "Ball Possession" → parse "32%" → 32.0
    shots              INT,                  -- "Total Shots"
    shots_on_target    INT,                  -- "Shots on Goal"
    shots_off_target   INT,                  -- "Shots off Goal"
    shots_blocked      INT,                  -- "Blocked Shots"
    shots_inside_box   INT,                  -- "Shots insidebox"
    shots_outside_box  INT,                  -- "Shots outsidebox"
    xg                 FLOAT,                -- "expected_goals"
    xg_ot              FLOAT,                -- xG on target
    goals_prevented    FLOAT,                -- "goals_prevented"
    passes             INT,                  -- "Total passes"
    passes_completed   INT,                  -- "Passes accurate"
    pass_accuracy_pct  FLOAT,                -- "Passes %"
    crosses            INT,
    crosses_completed  INT,
    corners            INT,                  -- "Corner Kicks"
    fouls              INT,                  -- "Fouls"
    yellow_cards       INT,                  -- "Yellow Cards"
    red_cards          INT,                  -- "Red Cards"
    offsides           INT,                  -- "Offsides"
    saves              INT,                  -- "Goalkeeper Saves"
    tackles            INT,
    tackles_won        INT,
    interceptions      INT,
    clearances         INT,
    aerial_duels       INT,
    aerial_duels_won   INT,
    formation          VARCHAR(10),          -- "4-3-3"

    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (match_id, team_id)
);

-- ---------------------------------------------------------------------------
-- MATCH EVENTS                    source: GET /fixtures/events
-- ---------------------------------------------------------------------------
CREATE TABLE match_events (
    id               SERIAL      PRIMARY KEY,
    match_id         INT         NOT NULL REFERENCES matches(id),
    team_id          INT         NOT NULL REFERENCES national_teams(id),
    player_id        INT         REFERENCES players(id),
    assist_player_id INT         REFERENCES players(id),

    minute           INT         NOT NULL,           -- time.elapsed
    extra_time       INT,                            -- time.extra
    type             VARCHAR(30) NOT NULL,           -- "Goal","Card","subst","Var"
    detail           VARCHAR(100),                  -- "Normal Goal","Own Goal","Penalty","Yellow Card"
    comments         VARCHAR(255),                  -- comments field
    score_home       INT,
    score_away       INT,

    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- MATCH LINEUPS                   source: GET /fixtures/lineups
-- ---------------------------------------------------------------------------
CREATE TABLE match_lineups (
    id         SERIAL      PRIMARY KEY,
    match_id   INT         NOT NULL REFERENCES matches(id),
    team_id    INT         NOT NULL REFERENCES national_teams(id),
    coach_id   INT         REFERENCES coaches(id),   -- coach.id from lineup response
    formation  VARCHAR(10),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (match_id, team_id)
);

-- ---------------------------------------------------------------------------
-- LINEUP PLAYERS                  source: GET /fixtures/lineups → startXI / substitutes
-- ---------------------------------------------------------------------------
CREATE TABLE lineup_players (
    id             SERIAL      PRIMARY KEY,
    lineup_id      INT         NOT NULL REFERENCES match_lineups(id),
    player_id      INT         NOT NULL REFERENCES players(id),
    shirt_number   INT,
    position_code  VARCHAR(10),             -- pos field e.g. "GK", "CB"
    grid_position  VARCHAR(10),             -- grid field e.g. "1:1" (raw API string)
    is_starter     BOOLEAN     NOT NULL DEFAULT TRUE,
    subbed_in_min  INT,
    subbed_out_min INT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (lineup_id, player_id)
);

-- ---------------------------------------------------------------------------
-- PLAYER MATCH STATISTICS         source: GET /fixtures/players
-- ---------------------------------------------------------------------------
CREATE TABLE player_match_stats (
    id                   SERIAL      PRIMARY KEY,
    match_id             INT         NOT NULL REFERENCES matches(id),
    player_id            INT         NOT NULL REFERENCES players(id),
    team_id              INT         NOT NULL REFERENCES national_teams(id),

    minutes_played       INT,                        -- games.minutes
    rating               FLOAT,                     -- games.rating (parsed from string)
    captain              BOOLEAN     NOT NULL DEFAULT FALSE,  -- games.captain
    substitute           BOOLEAN     NOT NULL DEFAULT FALSE,  -- games.substitute

    -- Attacking
    goals                INT         NOT NULL DEFAULT 0,   -- goals.total
    goals_conceded       INT,                        -- goals.conceded (goalkeeper)
    assists              INT         NOT NULL DEFAULT 0,   -- goals.assists
    saves                INT,                        -- goals.saves (goalkeeper)
    shots                INT,                        -- shots.total
    shots_on_target      INT,                        -- shots.on
    xg                   FLOAT,
    xa                   FLOAT,

    -- Passing
    passes               INT,                        -- passes.total
    passes_completed     INT,
    pass_accuracy_pct    FLOAT,                     -- passes.accuracy (parsed)
    key_passes           INT,                        -- passes.key

    -- Defending
    tackles              INT,                        -- tackles.total
    blocked_shots        INT,                        -- tackles.blocks
    interceptions        INT,                        -- tackles.interceptions
    clearances           INT,

    -- Duels
    duels_total          INT,                        -- duels.total
    duels_won            INT,                        -- duels.won

    -- Dribbles
    dribbles             INT,                        -- dribbles.attempts
    dribbles_completed   INT,                        -- dribbles.success
    dribbles_past        INT,                        -- dribbles.past

    -- Discipline
    fouls_committed      INT,                        -- fouls.committed
    fouls_suffered       INT,                        -- fouls.drawn
    yellow_cards         INT         NOT NULL DEFAULT 0,
    red_cards            INT         NOT NULL DEFAULT 0,
    offsides             INT,                        -- offsides (top-level field)

    -- Penalty
    penalty_won          INT,                        -- penalty.won
    penalty_committed    INT,                        -- penalty.commited (API typo)
    penalty_scored       INT,                        -- penalty.scored
    penalty_missed       INT,                        -- penalty.missed
    penalty_saved        INT,                        -- penalty.saved

    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (match_id, player_id)
);

-- ---------------------------------------------------------------------------
-- PLAYER SEASON STATISTICS        source: GET /players?league=X&season=Y
-- ---------------------------------------------------------------------------
CREATE TABLE player_season_stats (
    id                    SERIAL      PRIMARY KEY,
    player_id             INT         NOT NULL REFERENCES players(id),
    competition_season_id INT         NOT NULL REFERENCES competition_seasons(id),
    team_id               INT         NOT NULL REFERENCES national_teams(id),

    appearances           INT         NOT NULL DEFAULT 0,
    starts                INT         NOT NULL DEFAULT 0,
    minutes_played        INT         NOT NULL DEFAULT 0,
    goals                 INT         NOT NULL DEFAULT 0,
    assists               INT         NOT NULL DEFAULT 0,
    xg                    FLOAT,
    xa                    FLOAT,
    shots                 INT,
    shots_on_target       INT,
    passes                INT,
    passes_completed      INT,
    key_passes            INT,
    dribbles              INT,
    dribbles_completed    INT,
    tackles               INT,
    interceptions         INT,
    clearances            INT,
    fouls_committed       INT,
    fouls_suffered        INT,
    saves                 INT,
    yellow_cards          INT         NOT NULL DEFAULT 0,
    red_cards             INT         NOT NULL DEFAULT 0,
    penalty_scored        INT,
    penalty_missed        INT,
    average_rating        FLOAT,      -- computed from PlayerMatchStats

    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (player_id, competition_season_id, team_id)
);

-- ---------------------------------------------------------------------------
-- TEAM SEASON STATISTICS          source: GET /teams/statistics
-- ---------------------------------------------------------------------------
CREATE TABLE team_season_stats (
    id                    SERIAL      PRIMARY KEY,
    team_id               INT         NOT NULL REFERENCES national_teams(id),
    competition_season_id INT         NOT NULL REFERENCES competition_seasons(id),

    form                  VARCHAR(30),              -- "WDLDWW..."

    -- Totals
    matches_played        INT         NOT NULL DEFAULT 0,
    wins                  INT         NOT NULL DEFAULT 0,
    draws                 INT         NOT NULL DEFAULT 0,
    losses                INT         NOT NULL DEFAULT 0,

    -- Home split
    home_matches_played   INT         NOT NULL DEFAULT 0,
    home_wins             INT         NOT NULL DEFAULT 0,
    home_draws            INT         NOT NULL DEFAULT 0,
    home_losses           INT         NOT NULL DEFAULT 0,

    -- Away split
    away_matches_played   INT         NOT NULL DEFAULT 0,
    away_wins             INT         NOT NULL DEFAULT 0,
    away_draws            INT         NOT NULL DEFAULT 0,
    away_losses           INT         NOT NULL DEFAULT 0,

    -- Goals
    goals_for             INT         NOT NULL DEFAULT 0,
    goals_against         INT         NOT NULL DEFAULT 0,
    goals_for_home        INT         NOT NULL DEFAULT 0,
    goals_for_away        INT         NOT NULL DEFAULT 0,
    goals_against_home    INT         NOT NULL DEFAULT 0,
    goals_against_away    INT         NOT NULL DEFAULT 0,
    goals_for_avg         FLOAT,
    goals_against_avg     FLOAT,

    -- Special
    clean_sheets          INT         NOT NULL DEFAULT 0,
    clean_sheets_home     INT         NOT NULL DEFAULT 0,
    clean_sheets_away     INT         NOT NULL DEFAULT 0,
    failed_to_score       INT         NOT NULL DEFAULT 0,  -- failed_to_score.total

    -- Biggest results
    biggest_win_home      VARCHAR(10),              -- "4-0"
    biggest_win_away      VARCHAR(10),
    biggest_loss_home     VARCHAR(10),
    biggest_loss_away     VARCHAR(10),

    -- Streaks
    win_streak            INT,
    draw_streak           INT,
    loss_streak           INT,

    -- Penalties
    penalties_scored      INT,
    penalties_missed      INT,
    penalties_total       INT,

    -- Averages
    avg_possession_pct    FLOAT,
    avg_xg                FLOAT,
    avg_xg_against        FLOAT,
    avg_pass_accuracy_pct FLOAT,

    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (team_id, competition_season_id)
);

-- ---------------------------------------------------------------------------
-- TROPHIES
-- ---------------------------------------------------------------------------
CREATE TABLE trophies (
    id                    SERIAL      PRIMARY KEY,
    team_id               INT         NOT NULL REFERENCES national_teams(id),
    competition_season_id INT         NOT NULL REFERENCES competition_seasons(id),
    placement             INT         NOT NULL,   -- 1 = champion, 2 = runner-up, 3 = third
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (team_id, competition_season_id)
);

-- ---------------------------------------------------------------------------
-- PLAYER INJURIES                 source: GET /injuries
-- ---------------------------------------------------------------------------
CREATE TABLE player_injuries (
    id             SERIAL       PRIMARY KEY,
    player_id      INT          NOT NULL REFERENCES players(id),
    injury_type    VARCHAR(100) NOT NULL,   -- "hamstring", "knee", "muscle"
    body_part      VARCHAR(50),
    start_date     DATE         NOT NULL,
    end_date       DATE,
    matches_missed INT,
    severity       VARCHAR(20),             -- "minor", "moderate", "severe"
    notes          TEXT,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
