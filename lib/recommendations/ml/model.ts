/**
 * Logistic regression — Phase 2, Part 5's chosen starting model.
 *
 * WHY logistic regression (not gradient-boosted trees / LightGBM / a neural
 * net): this is a pure-TypeScript implementation with zero new runtime
 * dependencies (no Python process, no ONNX runtime, no new infrastructure —
 * "do not introduce unnecessary infrastructure"). It is:
 *   - interpretable: each weight has a direct, explainable sign/magnitude
 *     against a named feature (Part 15's "why recommended" requirement is
 *     trivial with this model, much harder with a tree ensemble or NN),
 *   - fast to train and to score: a dot product + sigmoid, microseconds
 *     per candidate (Part 23: must not slow page rendering),
 *   - appropriate for the actual data volume: as of Phase 2, this platform
 *     has 0 recorded recommendation interactions (see the audit in
 *     lib/recommendations/ml/audit.ts) — a model with dozens of learnable
 *     parameters (a small GBT ensemble) needs far more labeled examples
 *     than a ~19-parameter linear model to avoid pure noise-fitting. If the
 *     interaction volume grows into the thousands, PART_29 in the spec and
 *     Part 26 (ML maturity levels) explicitly anticipate swapping this for
 *     a learning-to-rank model without touching the surrounding
 *     pipeline — dataset.ts/features.ts/train.ts/evaluate.ts don't know or
 *     care which model.ts implementation backs them.
 */

export interface LogisticModelWeights {
  weights: number[];
  bias: number;
  featureNames: string[];
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

export interface TrainOptions {
  epochs: number;
  learningRate: number;
  /** L2 regularization strength — non-trivial given the small-dataset regime this model is meant for; prevents a handful of examples from driving any single weight to an extreme. */
  l2: number;
}

export const DEFAULT_TRAIN_OPTIONS: TrainOptions = { epochs: 300, learningRate: 0.1, l2: 0.01 };

/**
 * Batch gradient descent on binary cross-entropy loss + L2 penalty. Simple
 * on purpose — this dataset is small enough that a full-batch approach
 * (not SGD/mini-batches) is fast and deterministic, which matters for
 * reproducible model versions (Part 17).
 */
export function trainLogisticRegression(features: number[][], labels: number[], featureNames: string[], options: TrainOptions = DEFAULT_TRAIN_OPTIONS): LogisticModelWeights {
  const n = features.length;
  const dim = featureNames.length;
  const weights = new Array(dim).fill(0);
  let bias = 0;

  for (let epoch = 0; epoch < options.epochs; epoch++) {
    const gradWeights = new Array(dim).fill(0);
    let gradBias = 0;

    for (let i = 0; i < n; i++) {
      const pred = sigmoid(dot(weights, features[i]) + bias);
      const error = pred - labels[i];
      for (let j = 0; j < dim; j++) gradWeights[j] += error * features[i][j];
      gradBias += error;
    }

    for (let j = 0; j < dim; j++) {
      const regularized = gradWeights[j] / n + options.l2 * weights[j];
      weights[j] -= options.learningRate * regularized;
    }
    bias -= options.learningRate * (gradBias / n);
  }

  return { weights, bias, featureNames };
}

export function predictProbability(model: LogisticModelWeights, featureVector: number[]): number {
  return sigmoid(dot(model.weights, featureVector) + model.bias);
}

/** Top contributing features for one prediction (Part 15 explainability) — sorted by |weight * value|, the actual per-example contribution, not just raw weight magnitude. */
export function topContributingFeatures(model: LogisticModelWeights, featureVector: number[], topN = 3): { name: string; contribution: number }[] {
  const contributions = model.featureNames.map((name, i) => ({ name, contribution: model.weights[i] * featureVector[i] }));
  return contributions
    .filter((c) => c.name !== "bias_placeholder")
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, topN);
}
