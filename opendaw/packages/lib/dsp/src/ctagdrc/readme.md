# CTAGDRC Compressor - TypeScript Port

## Attribution

This is a TypeScript port of the CTAG Dynamic Range Compressor (CTAGDRC), originally created by Phillip Lamp.

**Original Project:**

- Name: CTAGDRC (CTAG Dynamic Range Compressor)
- Author: Phillip Lamp
- Original Repository: https://github.com/p-hlp/CTAGDRC
- Original License: GNU General Public License v3.0
- Copyright (C) 2020 Phillip Lamp

**LookAhead Implementation:**
The lookahead implementation is based on work by Daniel Rudrich:

- https://github.com/DanielRudrich/SimpleCompressor/blob/master/docs/lookAheadLimiter.md
- Copyright (C) 2019 Daniel Rudrich

## Description

This TypeScript implementation faithfully ports the DSP (Digital Signal Processing) algorithms from the original
C++/JUCE implementation to work in a web audio context. The compressor implements a feedforward VCA-style topology based
on research papers on digital dynamic range compression.

### Key Features Ported:

- **Gain Computer**: Calculates a compression curve with a threshold, ratio, and soft knee
- **Level Detector (Ballistics)**: Smooth branched peak detector for attack/release timing
- **Crest Factor Analysis**: Automatic attack/release adjustment based on signal characteristics
- **LookAhead Limiting**: Anticipates peaks and fades in gain reduction to prevent distortion
- **Auto Makeup Gain**: Time-varying makeup gain based on average attenuation
- **Parallel Compression**: Dry/wet mix control

## Technical References

The original implementation was based on the following academic papers:

1. Giannoulis, D., Massberg, M., & Reiss, J. D. (2012). "Digital Dynamic Range Compressor Design – A Tutorial and
   Analysis"
   https://www.eecs.qmul.ac.uk/~josh/documents/2012/GiannoulisMassbergReiss-dynamicrangecompression-JAES2012.pdf

2. Reiss, J. D. "Tutorial on Automatic Mixing"
   http://c4dm.eecs.qmul.ac.uk/audioengineering/compressors/documents/Reiss-Tutorialondynamicrangecompression.pdf

3. Giannoulis, D. "Parameter Automation in a Dynamic Range Compressor"
   http://c4dm.eecs.qmul.ac.uk/audioengineering/compressors/documents/Giannoulis.pdf

4. Giannoulis, D., Massberg, M., & Reiss, J. D. (2013). "Digital Dynamic Range Compression Automation"
   http://www.eecs.qmul.ac.uk/~josh/documents/2013/Giannoulis%20Massberg%20Reiss%20-%20dynamic%20range%20compression%20automation%20-%20JAES%202013.pdf

## License

This TypeScript port maintains the same license as the original work:

**GNU General Public License v3.0**

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

## Modifications

This TypeScript port includes the following adaptations:

- Conversion from C++ to TypeScript
- Adaptation to work with TypeScript/JavaScript typed arrays instead of JUCE AudioBuffer
- Integration with a web-based audio processing architecture
- Use of TypeScript private fields (#) and readonly keywords

The core DSP algorithms remain faithful to the original implementation.

## Credits

- **Original C++ Implementation**: Phillip Lamp (2020)
- **LookAhead Design**: Daniel Rudrich (2019)
- **TypeScript Port**: [Your Name/Organization] ([Year])

## Links

- Original CTAGDRC Project: https://github.com/p-hlp/CTAGDRC
- Original Demo Video: https://www.youtube.com/watch?v=ZFKPXIpGRq8