import React from 'react';
import { Box, Typography } from '@mui/material';

/**
 * Reusable page header (title + subtitle + optional right controls)
 * Styled to match the "Realtime Data View" header look.
 */
export default function PageHeader({
  icon,
  title,
  subtitle,
  right,
  sx,
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: { xs: 'flex-start', sm: 'center' },
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 1.5,
        px: 2.25,
        py: 1.25,
        bgcolor: 'background.paper',
        border: '1px solid rgba(0,0,0,0.06)',
        borderRadius: 1,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        ...(sx || {}),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mr: 1.25,
            bgcolor: 'rgba(37, 99, 235, 0.10)',
            color: 'primary.main',
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        <Box>
          <Typography sx={{ fontWeight: 800, color: 'text.primary', fontSize: '1.05rem', lineHeight: 1.15 }}>
            {title}
          </Typography>
          {subtitle ? (
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
              {subtitle}
            </Typography>
          ) : null}
        </Box>
      </Box>
      {right ? <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>{right}</Box> : null}
    </Box>
  );
}

