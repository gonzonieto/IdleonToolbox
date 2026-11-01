import React, { useContext, useMemo, useState } from 'react';
import Link from 'next/link';
import { NextSeo } from 'next-seo';
import {
  Alert, Box, Button, Card, CardContent, Chip, Container, FormControl, InputLabel,
  MenuItem, Select, Stack, Typography
} from '@mui/material';
import { AppContext } from '@components/common/context/AppProvider';
import { evaluateUpgrades } from '@utility/advisor/evaluate';
import { formatAdvisorNumber } from '@utility/advisor/format';
import { getRecommendations, OBJECTIVES } from '@utility/advisor/engine';
import { sessionQuery } from '@utility/nav-query';
import { sitePath } from '@utility/site-path';
import { useRouter } from 'next/router';

const ProgressionAdvisor = () => {
  const router = useRouter();
  const { state } = useContext(AppContext);
  const [objective, setObjective] = useState('damage');
  const [selectedName, setSelectedName] = useState('');
  const [batchSize, setBatchSize] = useState(10);
  const characters = state?.characters ?? [];
  const activeName = characters.some((entry) => entry?.name === selectedName)
    ? selectedName : characters[0]?.name ?? '';
  const evaluation = useMemo(() => state?.emptyAccount ? null : evaluateUpgrades({
    objective, account: state?.account, characters, characterName: activeName, batchSize
  }), [objective, state?.account, state?.emptyAccount, characters, activeName, batchSize]);
  const result = useMemo(() => getRecommendations({
    objective, account: state?.account, characters, characterName: activeName, evaluation
  }), [objective, state?.account, characters, activeName, evaluation]);
  const available = !state?.emptyAccount && Boolean(state?.account && characters.length);
  return <Container maxWidth="lg" sx={{ py: 3 }}>
    <NextSeo title="Progression Advisor | Idleon Toolbox"
             description="Local, explainable progression checks for damage and drop rate."/>
    <Stack spacing={2}>
      <Typography variant="h4">Progression Advisor</Typography>
      <Typography color="text.secondary">
        Specific upgrades calculated from your current save. Damage means displayed maximum damage, rather than AFK kills or active DPS.
      </Typography>
      <Alert severity="info">
        Each card groups affordable levels of one upgrade. Costs are added level by level and the combined gain is calculated with Toolbox’s formulas. Cards are ranked by gain and may use the same resources.
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
        <FormControl fullWidth size="small">
          <InputLabel id="advisor-batch-label">Levels per suggestion</InputLabel>
          <Select labelId="advisor-batch-label" value={batchSize} label="Levels per suggestion"
                  onChange={(event) => setBatchSize(Number(event.target.value))}>
            {[1, 10, 25, 100].map((n) => <MenuItem key={n} value={n}>Up to {n} {n === 1 ? 'level' : 'levels'}</MenuItem>)}
          </Select>
        </FormControl>
      </Stack>
      {!available ? <Alert severity="warning">Sign in or import your save to receive account-specific advice.</Alert> : null}
      {available ? <>
        <Typography variant="h6">Calculated upgrades</Typography>
        {result.diagnostics.map((detail) => <Typography variant="body2" color="text.secondary" key={detail}>{detail}</Typography>)}
        {!result.recommendations.length ? <Alert severity="info">
          {result.emptyMessage ?? 'The current metric could not be calculated. No upgrade conclusions are available.'}
        </Alert> : null}
        {result.recommendations.map((item, index) => <Card key={item.id} variant="outlined">
          <CardContent>
            <Stack spacing={1.5}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0 }}>
                  {item.icon ? <Box component="img" src={sitePath(item.icon)} alt="" width={32} height={32}
                                    sx={{ objectFit: 'contain', flexShrink: 0, imageRendering: 'pixelated' }}/> : null}
                  <Typography variant="h6">{index + 1}. {item.title}</Typography>
                </Stack>
                <Stack direction="row" spacing={1}>
                  <Chip size="small" label={`+${formatAdvisorNumber(item.gainPercent)}%`}/>
                </Stack>
              </Stack>
              <Typography variant="body2">Current: {formatAdvisorNumber(item.before)}. Increase: +{formatAdvisorNumber(item.after - item.before)} {objective === 'damage' ? 'maximum damage' : 'drop-rate multiplier'}.</Typography>
              <Typography variant="body2"><strong>Cost:</strong> {item.cost}</Typography>
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
        Coverage: supported talents, stamps, alchemy bubbles, direct-effect Upgrade Vault purchases, current Arcade shop offers, the Neon atom, and shared Power/Oceanman statue levels using statues in storage. Costs include unlocks, caps, current resources and eligible substitutions. Other upgrades are not evaluated. Gains cannot be added together, and recommendations may spend the same resources.
      </Typography>
    </Stack>
  </Container>;
};
export default ProgressionAdvisor;
