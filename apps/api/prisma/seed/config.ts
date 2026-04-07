// =============================================================================
// NITBox Seed Configuration
// All API-Football IDs verified against live API responses
// =============================================================================

export const API_BASE_URL = 'https://v3.football.api-sports.io';

// Competition IDs from API-Football
export const COMPETITIONS = [
  { apiFootballId: 1,  name: 'FIFA World Cup',                     shortName: 'World Cup',      type: 'world_cup',   confederation: 'FIFA'     },
  { apiFootballId: 4,  name: 'UEFA European Championship',          shortName: 'UEFA Euro',      type: 'continental', confederation: 'UEFA'     },
  { apiFootballId: 9,  name: 'Copa America',                        shortName: 'Copa America',   type: 'continental', confederation: 'CONMEBOL' },
  { apiFootballId: 6,  name: 'Africa Cup of Nations',               shortName: 'AFCON',          type: 'continental', confederation: 'CAF'      },
  { apiFootballId: 7,  name: 'AFC Asian Cup',                       shortName: 'Asian Cup',      type: 'continental', confederation: 'AFC'      },
  { apiFootballId: 22, name: 'CONCACAF Gold Cup',                   shortName: 'Gold Cup',       type: 'continental', confederation: 'CONCACAF' },
  { apiFootballId: 5,  name: 'UEFA Nations League',                 shortName: 'Nations League', type: 'league',      confederation: 'UEFA'     },
  { apiFootballId: 34, name: 'World Cup Qualification - CONMEBOL',  shortName: 'WCQ CONMEBOL',   type: 'qualifier',   confederation: 'CONMEBOL' },
  { apiFootballId: 32, name: 'World Cup Qualification - UEFA',      shortName: 'WCQ UEFA',       type: 'qualifier',   confederation: 'UEFA'     },
  { apiFootballId: 29, name: 'World Cup Qualification - CAF',       shortName: 'WCQ CAF',        type: 'qualifier',   confederation: 'CAF'      },
  { apiFootballId: 30, name: 'World Cup Qualification - AFC',       shortName: 'WCQ AFC',        type: 'qualifier',   confederation: 'AFC'      },
  { apiFootballId: 31, name: 'World Cup Qualification - CONCACAF',  shortName: 'WCQ CONCACAF',   type: 'qualifier',   confederation: 'CONCACAF' },
  { apiFootballId: 33, name: 'World Cup Qualification - OFC',       shortName: 'WCQ OFC',        type: 'qualifier',   confederation: 'OFC'      },
];

// Seasons to fetch — always from 2021 up to current year
const currentYear = new Date().getFullYear();
export const SEASONS: number[] = Array.from(
  { length: currentYear - 2021 + 1 },
  (_, i) => 2021 + i,
);

export const CONFEDERATIONS = [
  { code: 'FIFA',     name: 'Federation Internationale de Football Association' },
  { code: 'UEFA',     name: 'Union of European Football Associations' },
  { code: 'CONMEBOL', name: 'Confederacion Sudamericana de Futbol' },
  { code: 'CONCACAF', name: 'Confederation of North, Central America and Caribbean Association Football' },
  { code: 'CAF',      name: 'Confederation Africaine de Football' },
  { code: 'AFC',      name: 'Asian Football Confederation' },
  { code: 'OFC',      name: 'Oceania Football Confederation' },
];

// The 60 target national teams
// Fields: [api_football_team_id, api_name, iso2, iso3, confederation_code, fifa_code]
// - api_football_team_id: verified from live API calls
// - api_name: exact name as returned by API-Football
// - fifa_code: our internal unique 3-letter code (differs from api code where conflicts exist)
//
// NOTE: API-Football has code conflicts between teams (e.g. AUS=Austria+Australia,
//       SOU=South Korea+South Africa, IRA=Iran+Iraq, SLO=Slovakia+Slovenia).
//       We use ISO 3166-1 alpha-3 as our internal fifa_code to ensure uniqueness.

export const TEAMS: {
  apiFootballId: number;
  apiName: string;      // exact name in API-Football
  countryName: string;  // name we store in our DB
  iso2: string;
  iso3: string;
  confederation: string;
  fifaCode: string;     // unique internal code (ISO3 based where API has conflicts)
}[] = [
  // CONMEBOL (10) — all verified from Copa America 2024
  { apiFootballId: 26,   apiName: 'Argentina',    countryName: 'Argentina',    iso2: 'AR', iso3: 'ARG', confederation: 'CONMEBOL', fifaCode: 'ARG' },
  { apiFootballId: 6,    apiName: 'Brazil',        countryName: 'Brazil',       iso2: 'BR', iso3: 'BRA', confederation: 'CONMEBOL', fifaCode: 'BRA' },
  { apiFootballId: 7,    apiName: 'Uruguay',       countryName: 'Uruguay',      iso2: 'UY', iso3: 'URY', confederation: 'CONMEBOL', fifaCode: 'URY' },
  { apiFootballId: 8,    apiName: 'Colombia',      countryName: 'Colombia',     iso2: 'CO', iso3: 'COL', confederation: 'CONMEBOL', fifaCode: 'COL' },
  { apiFootballId: 2382, apiName: 'Ecuador',       countryName: 'Ecuador',      iso2: 'EC', iso3: 'ECU', confederation: 'CONMEBOL', fifaCode: 'ECU' },
  { apiFootballId: 2383, apiName: 'Chile',         countryName: 'Chile',        iso2: 'CL', iso3: 'CHL', confederation: 'CONMEBOL', fifaCode: 'CHL' },
  { apiFootballId: 2380, apiName: 'Paraguay',      countryName: 'Paraguay',     iso2: 'PY', iso3: 'PRY', confederation: 'CONMEBOL', fifaCode: 'PRY' },
  { apiFootballId: 2379, apiName: 'Venezuela',     countryName: 'Venezuela',    iso2: 'VE', iso3: 'VEN', confederation: 'CONMEBOL', fifaCode: 'VEN' },
  { apiFootballId: 30,   apiName: 'Peru',          countryName: 'Peru',         iso2: 'PE', iso3: 'PER', confederation: 'CONMEBOL', fifaCode: 'PER' },
  { apiFootballId: 2381, apiName: 'Bolivia',       countryName: 'Bolivia',      iso2: 'BO', iso3: 'BOL', confederation: 'CONMEBOL', fifaCode: 'BOL' },

  // UEFA (23) — verified from World Cup 2022 + UEFA Euro 2024
  { apiFootballId: 2,    apiName: 'France',        countryName: 'France',       iso2: 'FR', iso3: 'FRA', confederation: 'UEFA',     fifaCode: 'FRA' },
  { apiFootballId: 9,    apiName: 'Spain',         countryName: 'Spain',        iso2: 'ES', iso3: 'ESP', confederation: 'UEFA',     fifaCode: 'ESP' },
  { apiFootballId: 10,   apiName: 'England',       countryName: 'England',      iso2: 'GB', iso3: 'ENG', confederation: 'UEFA',     fifaCode: 'ENG' },
  { apiFootballId: 25,   apiName: 'Germany',       countryName: 'Germany',      iso2: 'DE', iso3: 'DEU', confederation: 'UEFA',     fifaCode: 'GER' },
  { apiFootballId: 27,   apiName: 'Portugal',      countryName: 'Portugal',     iso2: 'PT', iso3: 'PRT', confederation: 'UEFA',     fifaCode: 'POR' },
  { apiFootballId: 1118, apiName: 'Netherlands',   countryName: 'Netherlands',  iso2: 'NL', iso3: 'NLD', confederation: 'UEFA',     fifaCode: 'NED' },
  { apiFootballId: 1,    apiName: 'Belgium',       countryName: 'Belgium',      iso2: 'BE', iso3: 'BEL', confederation: 'UEFA',     fifaCode: 'BEL' },
  { apiFootballId: 768,  apiName: 'Italy',         countryName: 'Italy',        iso2: 'IT', iso3: 'ITA', confederation: 'UEFA',     fifaCode: 'ITA' },
  { apiFootballId: 3,    apiName: 'Croatia',       countryName: 'Croatia',      iso2: 'HR', iso3: 'HRV', confederation: 'UEFA',     fifaCode: 'CRO' },
  { apiFootballId: 15,   apiName: 'Switzerland',   countryName: 'Switzerland',  iso2: 'CH', iso3: 'CHE', confederation: 'UEFA',     fifaCode: 'SUI' },
  { apiFootballId: 21,   apiName: 'Denmark',       countryName: 'Denmark',      iso2: 'DK', iso3: 'DNK', confederation: 'UEFA',     fifaCode: 'DEN' },
  { apiFootballId: 775,  apiName: 'Austria',       countryName: 'Austria',      iso2: 'AT', iso3: 'AUT', confederation: 'UEFA',     fifaCode: 'AUT' }, // API code AUS — conflicts with Australia
  { apiFootballId: 777,  apiName: 'Turkiye',       countryName: 'Turkey',       iso2: 'TR', iso3: 'TUR', confederation: 'UEFA',     fifaCode: 'TUR' }, // API name is "Türkiye"
  { apiFootballId: 14,   apiName: 'Serbia',        countryName: 'Serbia',       iso2: 'RS', iso3: 'SRB', confederation: 'UEFA',     fifaCode: 'SRB' },
  { apiFootballId: 24,   apiName: 'Poland',        countryName: 'Poland',       iso2: 'PL', iso3: 'POL', confederation: 'UEFA',     fifaCode: 'POL' },
  { apiFootballId: 1108, apiName: 'Scotland',      countryName: 'Scotland',     iso2: 'GB', iso3: 'SCO', confederation: 'UEFA',     fifaCode: 'SCO' },
  { apiFootballId: 1090, apiName: 'Norway',        countryName: 'Norway',       iso2: 'NO', iso3: 'NOR', confederation: 'UEFA',     fifaCode: 'NOR' },
  { apiFootballId: 772,  apiName: 'Ukraine',       countryName: 'Ukraine',      iso2: 'UA', iso3: 'UKR', confederation: 'UEFA',     fifaCode: 'UKR' },
  { apiFootballId: 769,  apiName: 'Hungary',       countryName: 'Hungary',      iso2: 'HU', iso3: 'HUN', confederation: 'UEFA',     fifaCode: 'HUN' },
  { apiFootballId: 770,  apiName: 'Czech Republic', countryName: 'Czech Republic', iso2: 'CZ', iso3: 'CZE', confederation: 'UEFA', fifaCode: 'CZE' },
  { apiFootballId: 5,    apiName: 'Sweden',        countryName: 'Sweden',       iso2: 'SE', iso3: 'SWE', confederation: 'UEFA',     fifaCode: 'SWE' },
  { apiFootballId: 767,  apiName: 'Wales',         countryName: 'Wales',        iso2: 'GB', iso3: 'WAL', confederation: 'UEFA',     fifaCode: 'WAL' },
  { apiFootballId: 774,  apiName: 'Romania',       countryName: 'Romania',      iso2: 'RO', iso3: 'ROU', confederation: 'UEFA',     fifaCode: 'ROU' },

  // CONCACAF (7) — verified from Copa America 2024 + World Cup 2022
  { apiFootballId: 2384, apiName: 'USA',           countryName: 'United States', iso2: 'US', iso3: 'USA', confederation: 'CONCACAF', fifaCode: 'USA' },
  { apiFootballId: 16,   apiName: 'Mexico',        countryName: 'Mexico',       iso2: 'MX', iso3: 'MEX', confederation: 'CONCACAF', fifaCode: 'MEX' },
  { apiFootballId: 5529, apiName: 'Canada',        countryName: 'Canada',       iso2: 'CA', iso3: 'CAN', confederation: 'CONCACAF', fifaCode: 'CAN' },
  { apiFootballId: 29,   apiName: 'Costa Rica',    countryName: 'Costa Rica',   iso2: 'CR', iso3: 'CRI', confederation: 'CONCACAF', fifaCode: 'CRC' },
  { apiFootballId: 2385, apiName: 'Jamaica',       countryName: 'Jamaica',      iso2: 'JM', iso3: 'JAM', confederation: 'CONCACAF', fifaCode: 'JAM' },
  { apiFootballId: 11,   apiName: 'Panama',        countryName: 'Panama',       iso2: 'PA', iso3: 'PAN', confederation: 'CONCACAF', fifaCode: 'PAN' },
  { apiFootballId: 4672, apiName: 'Honduras',      countryName: 'Honduras',     iso2: 'HN', iso3: 'HND', confederation: 'CONCACAF', fifaCode: 'HON' },

  // CAF (12) — verified from AFCON 2023
  { apiFootballId: 31,   apiName: 'Morocco',       countryName: 'Morocco',      iso2: 'MA', iso3: 'MAR', confederation: 'CAF',      fifaCode: 'MAR' },
  { apiFootballId: 13,   apiName: 'Senegal',       countryName: 'Senegal',      iso2: 'SN', iso3: 'SEN', confederation: 'CAF',      fifaCode: 'SEN' },
  { apiFootballId: 19,   apiName: 'Nigeria',       countryName: 'Nigeria',      iso2: 'NG', iso3: 'NGA', confederation: 'CAF',      fifaCode: 'NGA' },
  { apiFootballId: 1501, apiName: 'Ivory Coast',   countryName: 'Ivory Coast',  iso2: 'CI', iso3: 'CIV', confederation: 'CAF',      fifaCode: 'CIV' },
  { apiFootballId: 32,   apiName: 'Egypt',         countryName: 'Egypt',        iso2: 'EG', iso3: 'EGY', confederation: 'CAF',      fifaCode: 'EGY' },
  { apiFootballId: 1530, apiName: 'Cameroon',      countryName: 'Cameroon',     iso2: 'CM', iso3: 'CMR', confederation: 'CAF',      fifaCode: 'CMR' },
  { apiFootballId: 1504, apiName: 'Ghana',         countryName: 'Ghana',        iso2: 'GH', iso3: 'GHA', confederation: 'CAF',      fifaCode: 'GHA' },
  { apiFootballId: 1532, apiName: 'Algeria',       countryName: 'Algeria',      iso2: 'DZ', iso3: 'DZA', confederation: 'CAF',      fifaCode: 'ALG' },
  { apiFootballId: 28,   apiName: 'Tunisia',       countryName: 'Tunisia',      iso2: 'TN', iso3: 'TUN', confederation: 'CAF',      fifaCode: 'TUN' },
  { apiFootballId: 1500, apiName: 'Mali',          countryName: 'Mali',         iso2: 'ML', iso3: 'MLI', confederation: 'CAF',      fifaCode: 'MLI' },
  { apiFootballId: 1508, apiName: 'Congo DR',      countryName: 'DR Congo',     iso2: 'CD', iso3: 'COD', confederation: 'CAF',      fifaCode: 'COD' }, // API name is "Congo DR"
  { apiFootballId: 1531, apiName: 'South Africa',  countryName: 'South Africa', iso2: 'ZA', iso3: 'ZAF', confederation: 'CAF',      fifaCode: 'RSA' },

  // AFC (8) — verified from World Cup 2022 + Asian Cup 2023
  { apiFootballId: 12,   apiName: 'Japan',         countryName: 'Japan',        iso2: 'JP', iso3: 'JPN', confederation: 'AFC',      fifaCode: 'JPN' },
  { apiFootballId: 17,   apiName: 'South Korea',   countryName: 'South Korea',  iso2: 'KR', iso3: 'KOR', confederation: 'AFC',      fifaCode: 'KOR' }, // API code SOU — conflicts with South Africa
  { apiFootballId: 23,   apiName: 'Saudi Arabia',  countryName: 'Saudi Arabia', iso2: 'SA', iso3: 'SAU', confederation: 'AFC',      fifaCode: 'KSA' },
  { apiFootballId: 22,   apiName: 'Iran',          countryName: 'Iran',         iso2: 'IR', iso3: 'IRN', confederation: 'AFC',      fifaCode: 'IRN' }, // API code IRA — conflicts with Iraq
  { apiFootballId: 20,   apiName: 'Australia',     countryName: 'Australia',    iso2: 'AU', iso3: 'AUS', confederation: 'AFC',      fifaCode: 'AUS' }, // API code AUS — conflicts with Austria
  { apiFootballId: 1569, apiName: 'Qatar',         countryName: 'Qatar',        iso2: 'QA', iso3: 'QAT', confederation: 'AFC',      fifaCode: 'QAT' },
  { apiFootballId: 1567, apiName: 'Iraq',          countryName: 'Iraq',         iso2: 'IQ', iso3: 'IRQ', confederation: 'AFC',      fifaCode: 'IRQ' }, // API code IRA — conflicts with Iran
  { apiFootballId: 1568, apiName: 'Uzbekistan',    countryName: 'Uzbekistan',   iso2: 'UZ', iso3: 'UZB', confederation: 'AFC',      fifaCode: 'UZB' },

  // OFC (2) — IDs to be confirmed (country search returned no results)
  // These will be skipped if not found in API
  { apiFootballId: 0,    apiName: 'New Zealand',   countryName: 'New Zealand',  iso2: 'NZ', iso3: 'NZL', confederation: 'OFC',      fifaCode: 'NZL' },
  { apiFootballId: 0,    apiName: 'New Caledonia', countryName: 'New Caledonia', iso2: 'NC', iso3: 'NCL', confederation: 'OFC',     fifaCode: 'NCL' },
];
