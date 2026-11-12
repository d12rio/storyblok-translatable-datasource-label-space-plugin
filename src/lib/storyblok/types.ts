export type Dimension = {
  id: number;
  name: string;
  entry_value: string;
};

export type Datasource = {
  id: number;
  name: string;
  slug: string;
  dimensions: Dimension[];
};

export type DatasourceEntry = {
  id: number;
  name: string;
  value: string;
  dimension_value: string | null;
};

export type LabelRow = {
  id: number;
  key: string;
  value: string;
  translations: Record<number, string>;
};


export type CellChange = {
  entryId: number;
  key: string;
  dimensionId: number | null;
  value: string;
  defaultValue: string;
};
