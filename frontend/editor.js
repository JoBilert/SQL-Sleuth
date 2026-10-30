/**
 * Monaco Editor initialization with SQL autocomplete
 */
let editor = null;

// Global schema info - completion provider reads from this
window.sqlSchemaInfo = {};

function initEditor(onExecute) {
    require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });

    require(['vs/editor/editor.main'], () => {
        editor = monaco.editor.create(document.getElementById('editor-container'), {
            value: '-- Schreibe deine SQL-Abfrage hier\nSELECT * FROM personen LIMIT 10;',
            language: 'sql',
            theme: 'vs-dark',
            automaticLayout: true,
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            folding: true,
            bracketPairColorization: { enabled: true },
            guides: { bracketPairs: true },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
        });

        // Register SQL completion provider (reads from global schemaInfo)
        registerSQLCompletion();

        // Ctrl+Enter to execute
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
            onExecute();
        });

        // Expose for external access
        window.sqlEditor = editor;
    });
}

// Global schema info - completion provider reads from this
window.sqlSchemaInfo = {};

function setSchemaInfo(info) {
    window.sqlSchemaInfo = info || {};
    // Re-register completion provider to pick up new schema
    if (editor && typeof monaco !== 'undefined') {
        registerSQLCompletion();
    }
}

function registerSQLCompletion() {
    if (typeof monaco === 'undefined') return;
    
    monaco.languages.registerCompletionItemProvider('sql', {
        provideCompletionItems: (model, position) => {
            const suggestions = [];
            const currentSchema = window.sqlSchemaInfo || {};

            // Keywords
            const keywords = [
                'SELECT', 'FROM', 'WHERE', 'JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN',
                'ON', 'AND', 'OR', 'NOT', 'IN', 'NOT IN', 'BETWEEN', 'LIKE', 'IS NULL', 'IS NOT NULL',
                'GROUP BY', 'ORDER BY', 'LIMIT', 'OFFSET', 'AS', 'DISTINCT',
                'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
                'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
                'WITH', 'UNION', 'INTERSECT', 'EXCEPT',
                'CREATE', 'TABLE', 'INDEX', 'VIEW', 'INSERT', 'UPDATE', 'DELETE',
                'PRIMARY KEY', 'FOREIGN KEY', 'REFERENCES', 'UNIQUE', 'NOT NULL',
            ];
            keywords.forEach(kw => suggestions.push({
                label: kw,
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: kw,
                detail: 'SQL Keyword',
            }));

            // Tables and columns from schema
            for (const [table, columns] of Object.entries(currentSchema)) {
                suggestions.push({
                    label: table,
                    kind: monaco.languages.CompletionItemKind.Class,
                    insertText: table,
                    detail: `Table: ${columns.join(', ')}`,
                });
                columns.forEach(col => suggestions.push({
                    label: col,
                    kind: monaco.languages.CompletionItemKind.Field,
                    insertText: col,
                    detail: `Column in ${table}`,
                }));
            }

            return { suggestions };
        },
    });

    // Hover provider for schema info
    monaco.languages.registerHoverProvider('sql', {
        provideHover: (model, position) => {
            const word = model.getWordAtPosition(position);
            if (!word) return null;

            const currentSchema = window.sqlSchemaInfo || {};
            for (const [table, columns] of Object.entries(currentSchema)) {
                if (word.word.toLowerCase() === table.toLowerCase()) {
                    return {
                        range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
                        contents: [{ value: `**Table: ${table}**\n\nColumns: ${columns.join(', ')}` }],
                    };
                }
                for (const col of columns) {
                    if (word.word.toLowerCase() === col.toLowerCase()) {
                        return {
                            range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
                            contents: [{ value: `**Column: ${col}** (in ${table})` }],
                        };
                    }
                }
            }
            return null;
        },
    });
}

function getEditorValue() {
    return editor?.getValue() || '';
}

function setEditorValue(value) {
    editor?.setValue(value);
}

function focusEditor() {
    editor?.focus();
}