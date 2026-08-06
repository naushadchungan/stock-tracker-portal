import {
  DocumentModel,
  TableColumn,
  TableRow,
} from "../models/documentModel.js";

export class DocumentBuilder {
  build(text: string): DocumentModel {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const headers: string[] = [];
    const columns: TableColumn[] = [];
    const rows: TableRow[] = [];

    let columnFound = false;

    for (const line of lines) {
      if (
        !columnFound &&
        /item|description|qty|quantity|rate|price|amount/i.test(line)
      ) {
        columnFound = true;

        line
          .split(/\s{2,}|\t+/)
          .filter(Boolean)
          .forEach((name, index) => {
            columns.push({
              name,
              index,
            });
          });

        continue;
      }

      if (!columnFound) {
        headers.push(line);
      } else {
        rows.push({
          values: line
            .split(/\s{2,}|\t+/)
            .filter(Boolean),
        });
      }
    }

    return {
      metadata: {
        pages: 1,
      },

      layout: {
        headers,
        sections: [],
      },

      tables: [
        {
          columns,
          rows,
        },
      ],

      blocks: lines.map((text) => ({
        text,
        page: 1,
      })),
    };
  }
}

export default new DocumentBuilder();