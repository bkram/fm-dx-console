import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { colors } from '../theme.js';

export default function TextPrompt({ label, hint, initialValue = '', placeholder, onSubmit, onCancel }) {
    const [value, setValue] = useState(initialValue);
    const [error, setError] = useState(null);
    useInput((input, key) => {
        if (key.escape || (key.ctrl && input === 'c')) onCancel();
    });
    return (
        <Box
            borderStyle="single"
            borderColor={colors.modalBorder}
            flexDirection="column"
            paddingX={2}
            width={48}
            backgroundColor={colors.modalBg}
            borderBackgroundColor={colors.modalBg}
        >
            <Text bold color={colors.title}>{label}</Text>
            <Text> </Text>
            {hint && <Text color={colors.modalFg}>{hint}</Text>}
            <Box>
                <Text color={colors.value}>› </Text>
                <TextInput
                    value={value}
                    placeholder={placeholder || ''}
                    onChange={(next) => { setError(null); setValue(next); }}
                    onSubmit={(v) => setError(onSubmit(v) || null)}
                />
            </Box>
            {error && <Text color={colors.bad}>{error}</Text>}
            <Text> </Text>
            <Text color={colors.title}>Enter=apply  Esc=cancel</Text>
        </Box>
    );
}
