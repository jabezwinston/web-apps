#include <Adafruit_NeoPixel.h>

// Configuration
#define LED_PIN 6          // Digital pin connected to WS2812B data line
#define MAX_LEDS 256       // Maximum number of LEDs supported
#define BAUD_RATE 115200   // Serial communication baud rate

// Create NeoPixel object
Adafruit_NeoPixel strip(MAX_LEDS, LED_PIN, NEO_GRB + NEO_KHZ800);

// Global variables
int ledCount = 8;         // Default LED count
int brightness = 128;      // Default brightness (0-255)
String inputString = "";   // String to hold incoming data
boolean stringComplete = false;  // Whether the string is complete

void setup() {
  // Initialize serial communication
  Serial.begin(BAUD_RATE);
  
  // Initialize NeoPixel strip
  strip.begin();
  strip.setBrightness(brightness);
  strip.show(); // Initialize all pixels to 'off'
  
  // Send initial status
  Serial.println("WS2812B Controller Ready");
  Serial.print("LED Count: ");
  Serial.println(ledCount);
  Serial.print("Brightness: ");
  Serial.println(brightness);
}

void loop() {
  // Check for serial data
  if (stringComplete) {
    processCommand(inputString);
    inputString = "";
    stringComplete = false;
  }
}

void serialEvent() {
  while (Serial.available()) {
    char inChar = (char)Serial.read();
    
    // Add character to input string
    inputString += inChar;
    
    // If the incoming character is a carriage return or newline, set a flag
    if (inChar == '\r' || inChar == '\n') {
      stringComplete = true;
    }
  }
}

void processCommand(String command) {
  command.trim(); // Remove whitespace, carriage return, and newline
  
  if (command.length() == 0) return;
  
  // Check for LED count command
  if (command.startsWith("led_count:")) {
    int newCount = command.substring(10).toInt();
    if (newCount > 0 && newCount <= MAX_LEDS) {
      ledCount = newCount;
      strip.updateLength(ledCount);
      Serial.print("LED count updated to: ");
      Serial.println(ledCount);
    }
    return;
  }
  
  // Check for brightness command
  if (command.startsWith("brightness:")) {
    int newBrightness = command.substring(11).toInt();
    if (newBrightness >= 0 && newBrightness <= 255) {
      brightness = newBrightness;
      strip.setBrightness(brightness);
      Serial.print("Brightness updated to: ");
      Serial.println(brightness);
    }
    return;
  }
  
  // Process LED color commands
  // Format: <led_num>:<r_val>,<g_val>,<b_val>; ...
  processLEDColors(command);
}

void processLEDColors(String command) {
  // Split command by semicolon to get individual LED commands
  int startPos = 0;
  int endPos = command.indexOf(';');
  
  while (endPos >= 0) {
    String ledCommand = command.substring(startPos, endPos);
    processSingleLED(ledCommand);
    
    startPos = endPos + 1;
    endPos = command.indexOf(';', startPos);
  }
  
  // Process the last command if no semicolon at the end
  if (startPos < command.length()) {
    String ledCommand = command.substring(startPos);
    processSingleLED(ledCommand);
  }
  
  // Update the strip
  strip.show();
}

void processSingleLED(String ledCommand) {
  ledCommand.trim();
  
  // Find the colon separator
  int colonPos = ledCommand.indexOf(':');
  if (colonPos == -1) return;
  
  // Extract LED number
  int ledNum = ledCommand.substring(0, colonPos).toInt();
  
  // Check if LED number is valid
  if (ledNum < 0 || ledNum >= ledCount) return;
  
  // Extract color values
  String colorString = ledCommand.substring(colonPos + 1);
  
  // Parse RGB values
  int comma1 = colorString.indexOf(',');
  int comma2 = colorString.indexOf(',', comma1 + 1);
  
  if (comma1 == -1 || comma2 == -1) return;
  
  int r = colorString.substring(0, comma1).toInt();
  int g = colorString.substring(comma1 + 1, comma2).toInt();
  int b = colorString.substring(comma2 + 1).toInt();
  
  // Clamp values to valid range
  r = constrain(r, 0, 255);
  g = constrain(g, 0, 255);
  b = constrain(b, 0, 255);
  
  // Set the LED color
  strip.setPixelColor(ledNum, r, g, b);
}

// Utility function to clear all LEDs
void clearAllLEDs() {
  for (int i = 0; i < ledCount; i++) {
    strip.setPixelColor(i, 0, 0, 0);
  }
  strip.show();
}

// Utility function to set all LEDs to the same color
void fillAllLEDs(uint8_t r, uint8_t g, uint8_t b) {
  for (int i = 0; i < ledCount; i++) {
    strip.setPixelColor(i, r, g, b);
  }
  strip.show();
}

// Utility function to set random colors
void setRandomColors() {
  for (int i = 0; i < ledCount; i++) {
    uint8_t r = random(256);
    uint8_t g = random(256);
    uint8_t b = random(256);
    strip.setPixelColor(i, r, g, b);
  }
  strip.show();
}
