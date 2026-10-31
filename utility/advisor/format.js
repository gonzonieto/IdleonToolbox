export const formatAdvisorNumber = (value) => {
  if (!Number.isFinite(value)) return 'Unavailable';
  const magnitude = Math.abs(value);
  if (magnitude >= 1e6 || (magnitude > 0 && magnitude < 0.001)) {
    return value.toExponential(2).replace('e+', 'e');
  }
  return value.toLocaleString('en-US', { maximumFractionDigits: 3 });
};
