import React, { useContext, useMemo, useState } from 'react';
import Link from 'next/link';
import { NextSeo } from 'next-seo';
import {
  Alert, Box, Button, Card, CardContent, Chip, Container, FormControl, InputLabel,
  MenuItem, Select, Stack, Typography
} from '@mui/material';
import { AppContext } from '@components/common/context/AppProvider';
import { getDropRate } from '@parsers/character';
import { getMaxDamage } from '@parsers/damage';
import { mainStatMap } from '@parsers/talents';
import { getRecommendations, OBJECTIVES } from '@utility/advisor/engine';
import { sessionQuery } from '@utility/nav-query';
import { useRouter } from 'next/router';

// Calculations are deliberately scoped to this page, never the global provider.
// A fresh save causes recalculation via AppContext; no network or LLM involved.
const calculateStats = (objective, account, characters, selectedName) => {
  if (!account || !Array.isArray(characters) || !characters.length) return {};
  const selected = characters.find((entry) => entry?.name === selectedName) ?? characters[0];
  if (!selected) return {};
  if (objective === 'dropRate') {
    return Object.fromEntries(characters.map((entry) => {
      try {
        return [entry.name, { dropRate: getDropRate(entry, account, characters)?.dropRate }];
      } catch {
        return [entry.name, { calculationUnavailable: true }]; // Never silently invent a value.
      }
    }));
  }
  try {
    const info = getMaxDamage(selected, characters, account);
    return { [selected.name]: {
      mainStat: mainStatMap?.[selected.class],
      maxDamage: info?.maxDamage,
      hitChance: info?.hitChance,
      survivability: info?.survivability
    } };
  } catch {
    return { [selected.name]: { calculationUnavailable: true } };
  }
};

const ProgressionAdvisor = () => {
  const router = useRouter();
  const { state } = useContext(AppContext);
  const [objective, setObjective] = useState('damage');
  const [selectedName, setSelectedName] = useState('');
  const characters = state?.characters ?? [];
  const activeName = characters.some((entry) => entry?.name === selectedName)
    ? selectedName : characters[0]?.name ?? '';
  const stats = useMemo(() => calculateStats(objective, state?.account, characters, activeName),
    [objective, state?.account, characters, activeName]);
  const result = useMemo(() => getRecommendations({
    objective, account: state?.account, characters, characterName: activeName, stats
  }), [objective, state?.account, characters, activeName, stats]);
  const available = !state?.emptyAccount && Boolean(state?.account && characters.length);
  return <Container maxWidth="lg" sx={{ py: 3 }}>
    <NextSeo title="Progression Advisor | Idleon Toolbox"
             description="Local, explainable progression checks for damage and drop rate."/>
    <Stack spacing={2}>
      <Typography variant="h4">Progression Advisor</Typography>
      <Typography color="text.secondary">
        Practical checks from your current save. Priority is a heuristic for what to inspect first, not an optimized upgrade order.
      </Typography>
      <Alert severity="info">
        Local calculations only. No AI API calls, no game automation, and no projected gains without verified formulas.
      </Alert>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <FormControl fullWidth size="small">
          <InputLabel id="advisor-objective-label">What do you want to improve?</InputLabel>
          <Select labelId="advisor-objective-label" value={objective}
                  label="What do you want to improve?" onChange={(event) => setObjective(event.target.value)}>
            {Object.entries(OBJECTIVES).map(([id, item]) =>
              <MenuItem value={id} key={id}>{item.label}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl fullWidth size="small" disabled={!available}>
          <InputLabel id="advisor-character-label">Character</InputLabel>
          <Select labelId="advisor-character-label" value={activeName} label="Character"
                  onChange={(event) => setSelectedName(event.target.value)}>
            {characters.map((entry) => <MenuItem key={entry.name} value={entry.name}>{entry.name}</MenuItem>)}
          </Select>
        </FormControl>
      </Stack>
      {!available ? <Alert severity="warning">Sign in or import your save to receive account-specific advice.</Alert> : null}
      {available ? <>
        <Typography variant="h6">Where to focus first</Typography>
        {result.diagnostics.map((detail) => <Typography variant="body2" color="text.secondary" key={detail}>{detail}</Typography>)}
        {!result.recommendations.length ? <Alert severity="info">
          No high-confidence opportunities were detected by the current rules. This does not mean your account is optimized;
          the first version covers only a handful of checks.
        </Alert> : null}
        {result.recommendations.map((item, index) => <Card key={item.id} variant="outlined">
          <CardContent>
            <Stack spacing={1.5}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
                <Typography variant="h6">{index + 1}. {item.title}</Typography>
                <Stack direction="row" spacing={1}>
                  <Chip size="small" label={`Priority ${Math.round(item.score)}`}/>
                  <Chip size="small" variant="outlined" label={`${item.confidence} confidence`}/>
                </Stack>
              </Stack>
              <Typography variant="body2">{item.rationale}</Typography>
              <Box component="ul" sx={{ my: 0, pl: 3 }}>
                {item.evidence.map((fact, i) => <li key={i}><Typography variant="body2">{fact}</Typography></li>)}
              </Box>
              <Typography variant="body2"><strong>Next step:</strong> {item.nextStep}</Typography>
              {item.caveat ? <Typography variant="caption" color="text.secondary">Limitation: {item.caveat}</Typography> : null}
              <Box><Button size="small" variant="outlined" component={Link}
                           href={{ pathname: item.route, query: sessionQuery(router.query) }}>
                Open relevant page
              </Button></Box>
            </Stack>
          </CardContent>
        </Card>)}
      </> : null}
      <Typography variant="caption" color="text.secondary">
        Recommendations are based on the current parsed save. Priority scores represent review urgency, not expected damage/drop-rate gains.
      </Typography>
    </Stack>
  </Container>;
};
export default ProgressionAdvisor;
