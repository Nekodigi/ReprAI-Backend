export type WordCountRes = {
  w_cnt: number;
  c_cnt: number;
};

export type User = {
  id: string;
  name: string;
};

export type Session = {
  id: string;
  last_text: string;
  last_updated: Date;
  cache_result: string;
};

export type Fix = {
  title: string;
  fixed: string;
};

export type Score = {
  politeness: number;
  readability: number;
};

export type AIRes = {
  fixed: string;
  fixes: Fix[];
  score: Score;
};
