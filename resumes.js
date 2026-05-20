// Real resume variants for testing. Edit in the dev panel to override at runtime.
window.RESUMES = {
  ml_engineer: `# Vishnu Garigipati
Montreal, Canada | (514) 641-0366 | vishnucanada@gmail.com | LinkedIn | GitHub | Website

## Summary
Computer Science graduate with over 1 year of internship experience in machine learning at Ericsson and ETS. Designed and deployed production ML systems for knowledge distillation, entropy-based statistical modelling, and end-to-end training and evaluation infrastructure. Proficient in PyTorch and TensorFlow with strong Python, Java, and C engineering foundations. Bilingual, English and French.

## Education
**Concordia University, Montreal, Canada** — Jan 2021 – Dec 2025
Bachelor of Computer Science. Courses: Deep Learning, Neural Networks, Artificial Intelligence, Data Structures & Algorithms.

## Experience
**AI Research Intern, École de Technologie Supérieure — Montreal, Canada** — Jul 2025 – Dec 2025
- Designed cross-architecture knowledge distillation pipeline (CNN teacher to MLP student) enabling complex physical-layer signal learning on compute-constrained embedded hardware; improved industry-standard baseline by 35%.
- Researched and implemented online learning algorithms for real-time context drift in 5G embedded systems; proposed novel modelling approaches validated through physics-based simulation at scale.
- Built end-to-end ML training, evaluation, and benchmarking pipelines in PyTorch and TensorFlow; generated large-scale synthetic training data using channel simulation frameworks.
- Collaborated with faculty researchers in bi-weekly sprint cycles; delivered complete system from algorithm design to open-sourced production implementation.

**Machine Learning Intern, Ericsson — Montreal, Canada** — Jan 2024 – Sep 2024
- Built ML feature engineering and data cleaning pipelines for autonomous vehicle telematics; deployed statistical models for network behaviour prediction under sparse data constraints.
- Deployed ML inference services with Docker, Kubernetes, and GitLab CI/CD on AWS and Azure; reduced deployment time 25%; achieved 60% latency reduction through distributed system optimization.
- Designed intent decomposition reasoning system (Python, Prolog) for structured multi-step action planning from high-level natural language network management goals.

## Projects
**Efficient Neural Constellation Learning for MIMO via Cross-Architecture Distillation** [GitHub]
- Designed novel distillation pipeline: CNN teacher trained on synthetic MIMO channel data; MLP student distilled via soft-label on-policy training for embedded real-time inference at the physical layer.
- Built large-scale physics-based simulation and evaluation benchmarking in PyTorch and TensorFlow; tested across thousands of channel conditions achieving 35% improvement over industry baseline.

**HCS: Hyperdimensional Computing for Semantic Communication in Object Detection for UAVs** [GitHub]
- Sole designer and implementer of a neuro-symbolic edge AI system combining deep learning object detection with Hyperdimensional Computing (HDC) symbolic encoding for semantic compression on UAV hardware.
- Achieved 75% bandwidth reduction and 20% energy savings through task-relevant feature selection and HDC encoding; demonstrated that symbolic representations complement neural models for edge deployment.

## Skills
- **Languages:** Python, Java, C, JavaScript, SQL, Prolog
- **ML / AI:** PyTorch, TensorFlow, Scikit-Learn, NumPy, Pandas; knowledge distillation, online learning, MaxEnt, HDC
- **Infrastructure:** Docker, Kubernetes, GitLab CI/CD, AWS, Azure, Camunda, Git / GitHub`,

  research: `# Vishnu Garigipati
Montreal, Canada | (514) 641-0366 | vishnucanada@gmail.com | LinkedIn | GitHub | Website

## Summary
Computer Science graduate with two papers under review at premier IEEE venues (ICC 2026, SECON 2026) on physical-layer machine learning and neural-symbolic edge AI. Over 1 year of research and industry internship experience spanning embedded ML systems, cross-architecture knowledge distillation, entropy-based statistical modelling, and private 5G network automation. Bilingual: Fluent English and French.

## Education
**Concordia University, Montreal, Canada** — Jan 2021 – Dec 2025
Bachelor of Computer Science. Courses: Deep Learning, Neural Networks, Artificial Intelligence, Algorithms.

## Experience
**AI Research Intern, École de Technologie Supérieure — Montreal, Canada** — Jul 2025 – Dec 2025
- Investigated embedded ML for 5G physical-layer systems; formulated novel problem framing combining cross-architecture distillation with online learning to address real-time channel distribution shift.
- Built end-to-end research infrastructure in PyTorch and TensorFlow: physics-based data generation, model training, evaluation harness, and automated benchmarking pipelines.
- Collaborated with faculty researchers in bi-weekly sprint cycles to iterate on hypotheses, present findings, and refine experimental methodology.

**Machine Learning Intern, Ericsson — Montreal, Canada** — Jan 2024 – Sep 2024
- Applied maximum entropy principle to construct probability distributions from limited network telemetry under entropy constraints; co-authored a patent application and research paper ("On Entropy-Based Distributions").
- Designed intent decomposition system (Python, Prolog, Camunda) translating high-level network management goals into structured multi-step automated commands for private 5G network control.
- Developed and deployed full-stack backend for autonomous vehicle communication over private 5G; achieved 60% latency reduction; containerized with Docker and Kubernetes on AWS and Azure.

## Publications
**Efficient Neural Constellation Learning for MIMO via Cross-Architecture Distillation** [GitHub] — ICC IEEE 2026 (under review)
- Proposed novel cross-architecture knowledge distillation pipeline (CNN teacher to MLP student) for physical-layer MIMO constellation learning on compute-constrained embedded hardware.
- Designed physics-based simulation framework generating large-scale synthetic 5G channel training data; benchmarked across thousands of SNR, modulation, and antenna configurations.

**HCS: Hyperdimensional Computing for Semantic Communication in Object Detection for UAVs** [GitHub] — SECON 2026 (under review)
- Proposed HDC-based semantic communication system for UAV-to-ground links: encodes task-relevant object detection semantics via symbolic AI and data compression rather than raw bit transmission.
- Achieved 75% bandwidth reduction and 20% energy savings on UAV edge hardware, addressing key constraints for 5G-connected unmanned aerial systems in inference-critical applications.

## Skills
- **Languages:** Python, Java, C, JavaScript, SQL, Prolog
- **ML / Research:** PyTorch, TensorFlow, Scikit-Learn, NumPy, Pandas; knowledge distillation, online learning, MaxEnt, HDC
- **Infrastructure:** Docker, Kubernetes, GitLab CI/CD, AWS, Azure, Camunda, Git / GitHub`
};

window.SAMPLE_JDS = {
  ml_role: `Senior Machine Learning Engineer — Edge AI Platform

We're building inference infrastructure for ML models running on resource-constrained edge devices. You'll own the model optimization pipeline: quantization, distillation, pruning, and the deployment story across heterogeneous hardware (NPUs, mobile GPUs, embedded CPUs).

Responsibilities:
- Design and ship production ML systems with strict latency and memory budgets
- Build training, evaluation, and benchmarking infrastructure in PyTorch
- Containerize and deploy inference services on Kubernetes
- Work closely with embedded teams on hardware-aware model design

Requirements:
- Strong Python + PyTorch; experience with model compression (distillation, quantization)
- Production deployment experience: Docker, Kubernetes, CI/CD
- Familiarity with edge/embedded constraints
- Bonus: experience with signal processing, wireless, or telemetry domains`,

  research_role: `Research Scientist — Wireless Machine Learning

We're a research team publishing at top venues (NeurIPS, ICML, IEEE ICC/SECON) on machine learning for next-generation wireless systems. Looking for a researcher to lead investigations into physical-layer learning, channel modeling, and edge inference.

Responsibilities:
- Formulate novel research problems at the intersection of ML and wireless
- Design and run experiments using physics-based simulation
- Publish at premier IEEE / ML venues; collaborate with academic partners
- Build research infrastructure for reproducible experimentation

Requirements:
- Strong publication record or demonstrated research output
- Deep familiarity with PyTorch, simulation frameworks, and ML training infra
- Background in signal processing, communications, or related physical-layer topics
- Ability to communicate findings to both technical and academic audiences`
};
