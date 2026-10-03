import { useEffect, useState } from 'react';
import { useStdout } from 'ink';

export const MIN_COLS = 80;
export const MIN_ROWS = 24;

export default function useTerminalSize() {
    const { stdout } = useStdout();
    const [size, setSize] = useState({
        cols: stdout.columns || MIN_COLS,
        rows: stdout.rows || MIN_ROWS,
    });
    useEffect(() => {
        const onResize = () => {
            const cols = stdout.columns || MIN_COLS;
            const rows = stdout.rows || MIN_ROWS;
            setSize((prev) => (prev.cols === cols && prev.rows === rows ? prev : { cols, rows }));
        };
        stdout.on('resize', onResize);
        return () => stdout.off('resize', onResize);
    }, [stdout]);
    return size;
}
