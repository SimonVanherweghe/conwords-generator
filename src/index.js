const ConwordsGenerator = require("./ConwordsGenerator.js");
// In your code you can use:
//const ConwordsGenerator = require('conwords-generator');

/**
 * //example description:
 *
 * 1) Compiles computer dictionaries
 * 2) Generate an 18x16 matrix with the compiled dictionaries.
 * 3) Iterate 8 times
 * 4) Apply the complete method to get a better final result.
 * 5) Print the final result and the questions
 * 6) Print the questions in JSON format.
 */

(async () => {
  //1) Compiles dictionaries
  const compilation = await ConwordsGenerator.compile([
    //Computer terms generated with  Chat GPT
    require("./diccionarios/gpt-informatica.json"),
    //trivia computing terms
    require("./diccionarios/trivia_informática.json"),
  ]);

  //2) Initializes the generator with the already generated compilation and a 36x36 matrix.
  const generator = new ConwordsGenerator({
    compilation,
    width: 36,
    height: 36,
  });
  let matrix = generator.generate();

  //3)Iterate 60 times
  for (let i = 0; i < 60; i++) {
    matrix = generator.iterate(matrix);
    console.log(
      `Iteration:${i + 1} Crosses:${matrix[0].intersections} Singles:${
        matrix[0].isolatedWords
      } ${Math.round(
        (100 * matrix[0].fillingPercentage) / matrix[0].width / matrix[0].height
      )}%`
    );
  }

  //4) The fill-in method is applied to fill empty spaces.
  console.log("Completing...\n");
  matrix = generator.fillEmptySpaces(matrix);

  //5) Prints the final result, the questions and the json
  console.log(generator.toString(matrix, true));

  //6) Print the questions in JSON format.
  //console.log(JSON.stringify(generator.getJSON(matrix), null, 2));
})();
