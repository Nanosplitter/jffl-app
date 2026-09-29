import type { LeagueSlug } from './types';

export interface ManagerReference {
  key: string; slug: LeagueSlug; teamId: string; manager: string;
  jfflSeed: number; leagueSeed: number; week2Rank: number; draftRank: number;
  seasons: number; trophies2025: number; trophies2021: number;
  trophies2013: number; trophies: number; finals: number;
  cupRank: number; cupAverageFinish: number; cupWins: number; cupLosses: number; cupTitles: number;
}
type Row = [LeagueSlug, string, string, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];
// Manager names and historical totals transcribed from the supplied Week 2 PDF
// and Week 3 email. Current ranks/scores always come from ESPN, not this baseline.
const rows: Row[] = [
  ['premier','16','Jason',2,1,1,5,25,2,4,10,13,13,7,11,17,11,2],
  ['premier','34','Donna',11,3,2,3,24,0,4,7,11,10,10,12.6,19,10,3],
  ['premier','30','Brendan',14,4,3,9,25,0,3,6,11,16,4,9.9,19,13,0],
  ['premier','44','Jeff',1,7,4,1,23,3,5,18,22,14,1,8.2,20,12,1],
  ['premier','38','Wayne',3,2,5,7,23,2,3,6,7,9,9,12.1,16,12,1],
  ['premier','45','Ryan',8,9,6,6,7,1,5,5,5,3,23,17.2,7,4,1],
  ['premier','42','Paula',18,6,7,4,22,1,3,4,5,3,31,20.8,2,10,0],
  ['premier','46','Brandi',5,8,8,8,6,0,2,2,2,5,21,16,8,5,0],
  ['premier','43','Chris',17,5,9,2,25,0,2,8,10,10,24,17.5,7,12,1],
  ['premier','47','Allison',10,10,10,10,3,0,1,1,1,1,37,29,0,2,0],
  ['championship','71','SeanT',20,8,1,5,23,0,1,2,5,6,13,13.1,12,12,1],
  ['championship','75','Randall',6,2,2,2,6,0,1,1,1,0,32,21,2,5,0],
  ['championship','74','Patrick',22,9,3,1,6,0,4,4,4,2,18,14.8,6,5,0],
  ['championship','72','SeanH',29,10,4,9,25,0,3,8,12,9,10,12.6,14,12,1],
  ['championship','1','Jasmin',4,1,5,3,3,1,1,1,1,0,30,20.3,3,2,0],
  ['championship','61','Michael',13,6,6,6,24,0,1,9,11,9,19,14.9,12,13,0],
  ['championship','76','Brad',7,3,7,7,25,0,1,2,5,5,17,14.1,7,13,0],
  ['championship','73','Josh',19,7,8,10,24,0,4,8,13,7,5,10.3,17,12,0],
  ['championship','78','Tom',9,4,9,4,22,1,2,2,6,6,20,13.4,13,13,0],
  ['championship','77','Becky',12,5,10,8,25,2,2,6,7,11,15,13.4,13,13,0],
  ['league-one','29','RonniColin',30,10,1,3,1,0,0,0,0,0,0,0,0,0,0],
  ['league-one','12','Joe',26,7,2,6,25,0,0,1,3,6,14,13.3,16,13,0],
  ['league-one','25','Gabriel',24,5,3,1,6,0,1,1,1,1,29,20.2,3,5,0],
  ['league-one','28','Al',23,4,4,4,25,0,2,2,3,2,22,16.1,6,13,0],
  ['league-one','27','Reggie',21,3,5,2,20,0,0,3,6,3,12,12.9,15,12,1],
  ['league-one','15','JoshuaS',28,9,6,9,3,0,0,0,0,0,35,27,0,2,0],
  ['league-one','22','J-Seitz',15,1,7,10,6,0,0,0,0,2,25,17.7,4,5,0],
  ['league-one','26','Wolfe',25,6,8,7,22,0,1,2,5,5,15,13.4,13,13,0],
  ['league-one','18','Richie',16,2,9,8,6,0,2,2,2,1,28,18.7,4,5,0],
  ['league-one','1','Sophia',27,8,10,5,4,0,2,2,2,3,33,23.5,0,3,0],
];
export const MANAGERS: ManagerReference[] = rows.map(([slug,teamId,manager,jfflSeed,leagueSeed,week2Rank,draftRank,seasons,trophies2025,trophies2021,trophies2013,trophies,finals,cupRank,cupAverageFinish,cupWins,cupLosses,cupTitles]) => ({ key: `${slug}:${teamId}`,slug,teamId,manager,jfflSeed,leagueSeed,week2Rank,draftRank,seasons,trophies2025,trophies2021,trophies2013,trophies,finals,cupRank,cupAverageFinish,cupWins,cupLosses,cupTitles }));
export const managerFor = (slug: string, id: string) => MANAGERS.find(item => item.key === `${slug}:${id}`);
export const TIMELINE = [
  { year: '2002', title: 'The first season', detail: '12 teams on NFL.com, split into Central, East and West divisions.' },
  { year: '2003–2005', title: 'A growing league', detail: 'Moved to Yahoo; expanded to 14, then 16, then 18 teams.' },
  { year: '2007', title: 'The ESPN era', detail: '20 teams with team quarterbacks and four divisions.' },
  { year: '2013', title: 'Premier and Championship', detail: 'Split into two leagues. The JFFL Cup and league cups began.' },
  { year: '2021', title: 'League One joins', detail: 'Expanded to 30 teams across three leagues.' },
  { year: '2026', title: 'Season 25', detail: 'Three leagues, four cups, and 13 trophies.' },
];
